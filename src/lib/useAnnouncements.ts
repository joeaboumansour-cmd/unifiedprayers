"use client";

import { useCallback, useEffect, useState } from "react";

import { onForeground } from "@/lib/live";
import { getSupabase } from "@/lib/supabase/client";
import type { AnnouncementRow } from "@/lib/supabase/types";

/**
 * Messages the app shows on top of itself: a banner on the Prayers tab, a modal
 * on open.
 *
 * These are the one thing in the app that must never be served from a cache.
 * Everything else here — the prayer text, the verse — is content, and yesterday
 * 's copy of content is fine. A message is a decision, and a decision that has
 * been reversed must come off the screen. An admin switching a modal off and
 * watching it stay up on a phone for the rest of the week is the failure this
 * file exists to prevent, so:
 *
 *   - the network is asked on mount, on every resume, and on a slow beat while
 *     the app is open, and its answer always replaces what is on screen;
 *   - the stored copy is a fallback for a device with no connection, never a
 *     first answer, and it hard-expires so an offline phone cannot show a dead
 *     message indefinitely.
 *
 * Dismissals are local, not a row in the database, and that is deliberate. The
 * app is fully usable signed out, so a great many readers have no account to
 * attach a dismissal to; storing it per device is the only rule that works the
 * same for everyone. The cost is that dismissing on a phone does not dismiss on
 * a laptop, which for a message meant to be seen once per device is right
 * anyway.
 */

const DISMISS_KEY = "up_dismissed_v1";
const CACHE_KEY = "up_announcements_v1";

/**
 * How long the stored copy may stand in for the network on a device that has
 * none. Long enough to cover a flight, short enough that a message withdrawn
 * yesterday cannot reappear today.
 */
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** How often an app left open on screen re-asks. */
const POLL_MS = 45_000;

/**
 * A dismissal is forgotten after this. Without it the record grows by one
 * entry per message for the life of the install, and an id reused by nothing
 * keeps a slot forever.
 */
const DISMISS_TTL_MS = 180 * 24 * 60 * 60 * 1000;

type Cached = { at: number; rows: AnnouncementRow[] };

/**
 * Whether a message should be on screen right now.
 *
 * The policy in 0003 already filters this for a reader, so for almost everyone
 * it is a second opinion that changes nothing. It exists for the one account it
 * does change something for: an admin, whose "read all" policy returns their
 * own drafts, their switched-off messages and everything they have scheduled
 * for next week. Without this, publishing a message for Friday would put it on
 * the admin's own home screen on Monday — and they would be the only person in
 * the world seeing it, which is the hardest kind of bug to be told about.
 *
 * The window is re-checked on the cached copy too, so a message cached while it
 * was live disappears once it ends, even offline.
 */
function isLive(r: AnnouncementRow): boolean {
  if (!r.active) return false;
  const now = Date.now();
  if (r.starts_at && Date.parse(r.starts_at) > now) return false;
  if (r.ends_at && Date.parse(r.ends_at) <= now) return false;
  return true;
}

function readDismissed(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISS_KEY) || "{}") as Record<
      string,
      number
    >;
    const cutoff = Date.now() - DISMISS_TTL_MS;
    const kept = Object.fromEntries(
      Object.entries(raw).filter(([, at]) => typeof at === "number" && at > cutoff),
    );
    if (Object.keys(kept).length !== Object.keys(raw).length) {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(kept));
    }
    return kept;
  } catch {
    return {};
  }
}

function writeCache(rows: AnnouncementRow[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), rows } satisfies Cached));
  } catch {
    /* private mode — it simply fetches every launch, which is the good case */
  }
}

function readCache(): AnnouncementRow[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const cache = raw ? (JSON.parse(raw) as Cached) : null;
    if (!cache?.rows) return null;
    // A copy this old is not evidence that anything in it is still true.
    if (Date.now() - cache.at > CACHE_MAX_AGE_MS) return null;
    return cache.rows.filter(isLive);
  } catch {
    return null;
  }
}

/**
 * @param signedIn `null` while the session is still being worked out. Audience
 * is a targeting decision, and guessing at it shows a "signed out only" message
 * to a signed-in reader for the half second before the answer arrives.
 */
export function useAnnouncements(signedIn: boolean | null): {
  banner: AnnouncementRow | null;
  modal: AnnouncementRow | null;
  dismiss: (id: string) => void;
} {
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [dismissed, setDismissed] = useState<Record<string, number>>({});

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    let live = true;
    // Set by the first answer that actually arrives. After that the stored
    // copy is never read again: what is on screen came from the server, and a
    // later failed poll must not roll it back to something older.
    let answered = false;

    const fallBackToCache = () => {
      if (!live || answered) return;
      const cached = readCache();
      if (cached) setRows(cached);
    };

    const refresh = async () => {
      try {
        const { data, error } = await supabase
          .from("announcements")
          .select("*")
          .order("priority", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(20);

        if (!live) return;
        if (error || !data) {
          fallBackToCache();
          return;
        }

        answered = true;
        const next = data.filter(isLive);
        setRows(next);
        writeCache(next);
      } catch {
        // Offline, or the project is unreachable. Whatever was stored covers
        // it, which is the only thing the stored copy is for.
        fallBackToCache();
      }
    };

    // Offline at launch is the one moment the cache goes on screen first;
    // otherwise the fetch below is a couple of hundred milliseconds away and a
    // withdrawn modal flashing up in the meantime is exactly the bug.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      fallBackToCache();
    }

    void refresh();
    const stop = onForeground(() => void refresh(), POLL_MS);

    return () => {
      live = false;
      stop();
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = { ...prev, [id]: Date.now() };
      try {
        localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
      } catch {
        // Only in memory then: it stays gone for this session and comes back
        // next launch. Better than the alternative of refusing to dismiss.
      }
      return next;
    });
  }, []);

  const eligible = rows.filter((r) => {
    if (!isLive(r)) return false;
    if (dismissed[r.id] && r.dismissible) return false;
    // Anything targeted waits for a definite answer about the session; "all"
    // never has to wait, which is the audience nearly every message uses.
    if (r.audience === "signed_in" && signedIn !== true) return false;
    if (r.audience === "signed_out" && signedIn !== false) return false;
    return true;
  });

  // One of each at most. Two modals stacked on launch is not a design anyone
  // chose, it is what happens when nobody decides; the priority column decides.
  return {
    banner: eligible.find((r) => r.kind === "banner") ?? null,
    modal: eligible.find((r) => r.kind === "modal") ?? null,
    dismiss,
  };
}
