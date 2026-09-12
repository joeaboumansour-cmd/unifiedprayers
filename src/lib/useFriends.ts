"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { onForeground } from "@/lib/live";
import { getSupabase } from "@/lib/supabase/client";
import type {
  FriendOverviewRow,
  FriendRequestView,
  IntentionFeedRow,
  SearchPersonRow,
} from "@/lib/supabase/types";

/**
 * The Friends page's whole state, and everything that changes it.
 *
 * Like `useCouple`, nothing here is a permission. Every list below is what the
 * database was willing to return to this account through the functions in
 * 0016_friends.sql, and every action is a call back into one of them — the
 * hook holds no rule of its own. `canNudge` going stale costs a button that
 * refuses once; it cannot ring a bell the database would not.
 *
 * Also like couples, and for the same reason, none of it is cached to
 * localStorage. These are other people: a friend who unfriended you overnight,
 * an intention that was closed, a request already accepted on another device.
 * Showing yesterday's copy of any of them is worse than showing nothing, and
 * signed out the answer is simply an empty page with no request made.
 *
 * The whole page refreshes together, on one call per section, because the
 * sections are not independent: accepting a request removes it from one list
 * and adds a row to another, and a friend arriving brings their intentions
 * with them.
 */

export type FriendsStatus = "loading" | "signed-out" | "ready";

/** What went wrong, as something the screen turns into its own wording. */
export type FriendsError =
  | "self"
  | "unknown-person"
  | "already"
  | "too-soon"
  | "full"
  | "cool-off"
  | "own-link"
  | "expired"
  | "limit"
  | "offline";

export type Friends = {
  status: FriendsStatus;
  list: FriendOverviewRow[];
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
  intentions: IntentionFeedRow[];
  /** This account's open invite link, once one has been asked for. */
  inviteUrl: string | null;
  /** A ring is in flight for this friend, so the bell shows it is working. */
  ringing: string | null;
  refresh: () => void;

  search: (q: string) => Promise<SearchPersonRow[]>;
  add: (userId: string) => Promise<FriendsError | null>;
  accept: (userId: string) => Promise<FriendsError | null>;
  decline: (userId: string) => Promise<FriendsError | null>;
  cancel: (userId: string) => Promise<FriendsError | null>;
  remove: (userId: string) => Promise<FriendsError | null>;

  /** Asks for a link, replacing any previous one. Returns the URL. */
  makeInvite: () => Promise<string | null>;
  /** Kills the current link. A link sent to the wrong chat, undone. */
  revokeInvite: () => Promise<boolean>;
  /** Redeems someone's link. Used by the `?friend=` deep link. */
  redeem: (code: string) => Promise<FriendsError | null>;

  nudge: (userId: string) => Promise<FriendsError | null>;
  post: (body: string) => Promise<FriendsError | null>;
  pray: (intentionId: string) => Promise<FriendsError | null>;
  close: (intentionId: string) => Promise<FriendsError | null>;
};

/**
 * Postgres errcodes to something the screen can say. The functions in 0016
 * raise a distinct code per reason precisely so this mapping can exist; see the
 * table at the top of the writes section there.
 *
 * The same code means different things in different calls — 23505 is "already
 * friends" when adding and "rung too recently" when nudging — so the caller
 * passes what it was trying to do.
 */
function reason(
  code: string | undefined,
  doing: "add" | "nudge" | "redeem" | "post",
): FriendsError {
  if (doing === "nudge") return code === "23505" ? "too-soon" : "unknown-person";
  if (doing === "post") return "limit";
  if (doing === "redeem") {
    if (code === "P0001") return "own-link";
    if (code === "23505") return "already";
    return "expired";
  }
  if (code === "P0001") return "cool-off";
  if (code === "23505") return "already";
  if (code === "P0002") return "unknown-person";
  return "offline";
}

/** The token, when there is a session. The two friends routes require one. */
async function authHeader(): Promise<Record<string, string>> {
  const supabase = getSupabase();
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useFriends(userId: string | null): Friends {
  const [status, setStatus] = useState<FriendsStatus>("loading");
  const [list, setList] = useState<FriendOverviewRow[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestView[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestView[]>([]);
  const [intentions, setIntentions] = useState<IntentionFeedRow[]>([]);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [ringing, setRinging] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  /* The three lists, in parallel. They are one page and they arrive together;
     staggering them would draw a friends list above an empty request queue
     that then pushes it down the screen a moment later. */
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !userId) {
      setStatus("signed-out");
      setList([]);
      setIncoming([]);
      setOutgoing([]);
      setIntentions([]);
      setInviteUrl(null);
      return;
    }

    let live = true;
    // Only the first ask shows "loading". A foreground re-ask that dropped back
    // through it would blank the page for a round trip on every resume.
    setStatus((was) => (was === "loading" || was === "signed-out" ? "loading" : was));

    (async () => {
      const [friends, requests, wall] = await Promise.all([
        supabase.rpc("friends_overview"),
        supabase.rpc("friend_requests_overview"),
        supabase.rpc("intentions_feed"),
      ]);
      if (!live) return;

      setList(friends.data ?? []);
      const rows = requests.data ?? [];
      setIncoming(rows.filter((r) => r.direction === "incoming"));
      setOutgoing(rows.filter((r) => r.direction === "outgoing"));
      setIntentions(wall.data ?? []);
      setStatus("ready");
    })().catch(() => {
      if (!live) return;
      // Offline. With an answer already in hand the lists stay as they are —
      // a resume on bad signal is the common case and is no evidence anything
      // has changed. With no answer yet the page is simply empty.
      setStatus((was) => (was === "ready" ? was : "ready"));
    });

    return () => {
      live = false;
    };
  }, [userId, tick]);

  /* The link, asked for separately: it is the only thing on the page that is
     about this account rather than about other people, and it does not change
     when they act. Re-asking for it on every foreground would be a query per
     resume for a string that changes when the reader taps a button. */
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !userId) return;
    let live = true;
    (async () => {
      const { data } = await supabase
        .from("friend_invites")
        .select("code, expires_at, uses, max_uses")
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .limit(1);
      if (!live) return;
      const row = data?.[0];
      setInviteUrl(row && row.uses < row.max_uses ? inviteLink(row.code) : null);
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [userId, tick]);

  /* Everything on this page is changed by somebody else's phone — that is what
     makes it a social page. A request accepted, a bell rung, an intention
     posted: none of them touch this device. So the same beat the rest of the
     app uses on resume, and a slower poll while it is open. */
  useEffect(() => {
    if (!userId || !getSupabase()) return;
    return onForeground(refresh, 2 * 60 * 1000);
  }, [userId, refresh]);

  /* ---------------------------- people ---------------------------- */

  const search = useCallback(async (q: string): Promise<SearchPersonRow[]> => {
    const supabase = getSupabase();
    if (!supabase || q.trim().length < 2) return [];
    const { data } = await supabase.rpc("search_people", { q });
    return data ?? [];
  }, []);

  /** Every plain action has the same shape: call, map the error, re-read. */
  const act = useCallback(
    async (
      run: () => Promise<{ error: { code?: string } | null }>,
      doing: "add" | "nudge" | "redeem" | "post" = "add",
    ): Promise<FriendsError | null> => {
      const supabase = getSupabase();
      if (!supabase) return "offline";
      try {
        const { error } = await run();
        if (error) return reason(error.code, doing);
        refresh();
        return null;
      } catch {
        return "offline";
      }
    },
    [refresh],
  );

  const add = useCallback(
    (target: string) =>
      act(async () => {
        const supabase = getSupabase()!;
        return supabase.rpc("send_friend_request", { target });
      }),
    [act],
  );

  const accept = useCallback(
    (from_user: string) =>
      act(async () => getSupabase()!.rpc("accept_friend_request", { from_user })),
    [act],
  );

  const decline = useCallback(
    (from_user: string) =>
      act(async () => getSupabase()!.rpc("decline_friend_request", { from_user })),
    [act],
  );

  const cancel = useCallback(
    (to_user: string) =>
      act(async () => getSupabase()!.rpc("cancel_friend_request", { to_user })),
    [act],
  );

  const remove = useCallback(
    (other: string) => act(async () => getSupabase()!.rpc("remove_friend", { other })),
    [act],
  );

  /* ---------------------------- the link ---------------------------- */

  const makeInvite = useCallback(async (): Promise<string | null> => {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase.rpc("create_friend_invite");
    if (error || typeof data !== "string") return null;
    const url = inviteLink(data);
    setInviteUrl(url);
    return url;
  }, []);

  const revokeInvite = useCallback(async (): Promise<boolean> => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase.rpc("revoke_friend_invite");
    if (error) return false;
    setInviteUrl(null);
    return true;
  }, []);

  const redeem = useCallback(
    (code: string) =>
      act(
        async () => getSupabase()!.rpc("accept_friend_invite", { invite_code: code }),
        "redeem",
      ),
    [act],
  );

  /* ---------------------------- the bell ---------------------------- */

  /**
   * Rings, through the route rather than the database directly.
   *
   * The RPC alone would record the ring and deliver nothing — sending needs the
   * VAPID key, which is server-side. So this posts to /api/friends/nudge, which
   * calls that same RPC as this user and only then sends. The rate limit is
   * still the database's; this cannot reach around it.
   */
  const nudge = useCallback(
    async (target: string): Promise<FriendsError | null> => {
      setRinging(target);
      try {
        const res = await fetch("/api/friends/nudge", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({ target }),
        });
        if (!res.ok) {
          const { error } = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          return error === "too-soon" ? "too-soon" : "unknown-person";
        }
        // Re-read so the bell goes to its spent state from the database's
        // answer rather than from an assumption made here.
        refresh();
        return null;
      } catch {
        return "offline";
      } finally {
        setRinging(null);
      }
    },
    [refresh],
  );

  /* -------------------------- intentions --------------------------- */

  const post = useCallback(
    async (body: string): Promise<FriendsError | null> => {
      try {
        const res = await fetch("/api/friends/intention", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({ action: "post", body }),
        });
        if (!res.ok) {
          const { error } = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          return error === "limit" ? "limit" : "offline";
        }
        refresh();
        return null;
      } catch {
        return "offline";
      }
    },
    [refresh],
  );

  const pray = useCallback(
    async (intention: string): Promise<FriendsError | null> => {
      /* Counted on screen the moment it is tapped, and put back if the call
         fails. The alternative — waiting for the round trip — is a button that
         does nothing for half a second, which reads as broken and gets tapped
         again. The database ignores the second tap either way. */
      setIntentions((was) =>
        was.map((i) =>
          i.id === intention && !i.i_prayed
            ? { ...i, i_prayed: true, prayed_count: i.prayed_count + 1 }
            : i,
        ),
      );
      try {
        const res = await fetch("/api/friends/intention", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({ action: "prayed", intention }),
        });
        if (!res.ok) {
          refresh();
          return "offline";
        }
        return null;
      } catch {
        refresh();
        return "offline";
      }
    },
    [refresh],
  );

  const close = useCallback(
    (intention: string) =>
      act(async () => getSupabase()!.rpc("close_intention", { intention })),
    [act],
  );

  return {
    status,
    list,
    incoming,
    outgoing,
    intentions,
    inviteUrl,
    ringing,
    refresh,
    search,
    add,
    accept,
    decline,
    cancel,
    remove,
    makeInvite,
    revokeInvite,
    redeem,
    nudge,
    post,
    pray,
    close,
  };
}

/**
 * The link that goes in the WhatsApp message.
 *
 * Built from the running origin rather than a configured base URL, so it is
 * right on localhost, on a preview deployment and in production without
 * anything to keep in step. `?friend=` is read on launch by page.tsx.
 */
export function inviteLink(code: string): string {
  const origin =
    typeof window === "undefined" ? "" : window.location.origin.replace(/\/$/, "");
  return `${origin}/?friend=${code}`;
}

/**
 * Hands the invitation to WhatsApp, or to whatever the phone offers.
 *
 * `navigator.share` first, because on a phone it is the native sheet and puts
 * WhatsApp one tap away alongside everything else the person actually uses.
 * The wa.me link is the fallback for desktop, where the Web Share API is mostly
 * absent — and it is deliberately not the first choice even though the ask was
 * "invite through WhatsApp": the share sheet gets there in the same number of
 * taps and does not fail for someone who uses something else.
 *
 * Returns false when neither worked, so the caller can fall back to copying.
 */
export async function shareInvite(url: string, message: string): Promise<boolean> {
  const text = `${message} ${url}`;
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ text });
      return true;
    } catch {
      // Cancelled, or refused. Either way the person has seen the sheet and
      // opening a second one behind it would be a surprise.
      return true;
    }
  }
  try {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    return true;
  } catch {
    return false;
  }
}

/** Copies the link. Returns whether the clipboard accepted it. */
export async function copyInvite(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * A friend's last activity as a short phrase.
 *
 * Deliberately vague past a couple of days. "Prayed 47 days ago" is a number
 * that invites a judgement about somebody's prayer life, which is not what this
 * page is for; "a while ago" says the same thing kindly.
 */
export function useNow(everyMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const t = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(t);
  }, [everyMs]);
  return now;
}
