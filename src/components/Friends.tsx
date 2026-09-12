"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import type {
  FriendOverviewRow,
  IntentionFeedRow,
  SearchPersonRow,
} from "@/lib/supabase/types";
import {
  type Friends as FriendsState,
  type FriendsError,
  copyInvite,
  shareInvite,
  useNow,
} from "@/lib/useFriends";

/**
 * The Friends page.
 *
 * English throughout, like Settings and Admin and for the same reason: this is
 * an account surface rather than prayer text. The names on it are whatever
 * people typed, the intentions are whatever they wrote, and a page that
 * mirrored its layout around those would be deciding a direction for content it
 * cannot read. The prayer side of the app stays bilingual and untouched; the
 * notifications this page sends are bilingual too, since the service worker
 * picks a language at delivery time from the setting on the device.
 *
 * Order on the page is by urgency, not by feature:
 *
 *   1. someone is waiting on you — requests
 *   2. someone asked for prayer — the wall
 *   3. your friends, and the bell
 *   4. adding more: search, and the link to send
 *
 * Somebody who opens this page every day sees the first three and never needs
 * to scroll to the fourth, which is the one they only use when they use it.
 */

const EASE = "cubic-bezier(.22,1,.36,1)";

const sectionLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: "var(--dim-2)",
  marginBottom: 12,
};

const card: CSSProperties = {
  borderRadius: 18,
  background: "rgb(var(--veil-rgb) / .045)",
  border: "1px solid rgb(var(--veil-rgb) / .07)",
};

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** What the screen says when the database refuses. One line, never a code. */
const SAYS: Record<FriendsError, string> = {
  self: "That is your own account.",
  "unknown-person": "That account is no longer available.",
  already: "You are already friends.",
  "too-soon": "You have already rung them this hour.",
  full: "That friends list is full.",
  "cool-off": "They have not answered your last request yet.",
  "own-link": "That is your own invitation link.",
  expired: "That link has expired or been used up.",
  limit: "That is enough intentions for one day.",
  offline: "No connection. Try again in a moment.",
};

function button(tone: "accent" | "quiet" | "danger"): CSSProperties {
  const c = {
    accent: { fg: "var(--on-accent)", bg: "rgb(var(--accent-rgb) / .9)", br: "transparent" },
    quiet: { fg: "var(--soft)", bg: "rgb(var(--veil-rgb) / .05)", br: "rgb(var(--veil-rgb) / .12)" },
    danger: { fg: "var(--danger)", bg: "rgb(var(--danger-rgb) / .1)", br: "rgb(var(--danger-rgb) / .35)" },
  }[tone];
  return {
    appearance: "none",
    borderRadius: 999,
    padding: "9px 15px",
    fontSize: 13.5,
    fontWeight: 500,
    fontFamily: "inherit",
    cursor: "pointer",
    color: c.fg,
    background: c.bg,
    border: `1px solid ${c.br}`,
    flex: "none",
  };
}

/**
 * Somebody's picture, or the first letter of their name in a tinted disc.
 *
 * No avatar is the common case — nothing in the app uploads one yet — so the
 * letter is the design rather than the fallback. The tint is derived from the
 * username so one person is the same colour everywhere on the page, which is
 * what makes a list of discs scannable at all.
 */
function Avatar({
  name,
  username,
  url,
  size = 40,
}: {
  name: string;
  username: string;
  url: string | null;
  size?: number;
}) {
  // A stable hue per handle. Not random: the same person must not change
  // colour between the search results and the friends list.
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) % 360;

  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flex: "none",
        borderRadius: 999,
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        fontSize: size * 0.4,
        fontWeight: 600,
        color: `hsl(${h} 55% 72%)`,
        background: `hsl(${h} 45% 50% / .16)`,
        border: "1px solid rgb(var(--veil-rgb) / .08)",
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        (name.trim()[0] || username[0] || "?").toUpperCase()
      )}
    </div>
  );
}

/** The bell beside a friend's name. Filled while it is available. */
function Bell({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 19, height: 19 }} aria-hidden="true">
      {on && (
        <path
          d="M12 4.2a5.6 5.6 0 0 1 5.6 5.6c0 3.2.7 4.9 1.5 5.9H4.9c.8-1 1.5-2.7 1.5-5.9A5.6 5.6 0 0 1 12 4.2Z"
          fill="currentColor"
          opacity={0.16}
        />
      )}
      <path
        d="M12 4.2a5.6 5.6 0 0 1 5.6 5.6c0 3.2.7 4.9 1.5 5.9H4.9c.8-1 1.5-2.7 1.5-5.9A5.6 5.6 0 0 1 12 4.2Z"
        {...STROKE}
      />
      <path d="M10.2 18.4a1.9 1.9 0 0 0 3.6 0M12 2.4v1.8" {...STROKE} />
    </svg>
  );
}

/** A streak, as a flame. Only drawn when there is one to draw. */
function Flame() {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 13, height: 13 }} aria-hidden="true">
      <path
        d="M12 3.5c2.6 3 4.7 4.7 4.7 8.2a4.7 4.7 0 1 1-9.4 0c0-1.4.5-2.5 1.3-3.5.3 1 .9 1.6 1.7 1.8-.1-2.5.7-4.6 1.7-6.5Z"
        fill="currentColor"
        opacity={0.9}
      />
    </svg>
  );
}

/** One line of feedback under whatever was just tapped. */
function Note({ error, ok }: { error?: FriendsError | null; ok?: string | null }) {
  if (!error && !ok) return null;
  return (
    <div
      role="status"
      style={{
        fontSize: 12.5,
        lineHeight: 1.6,
        marginTop: 8,
        color: error ? "var(--danger)" : "var(--accent-ink)",
      }}
    >
      {error ? SAYS[error] : ok}
    </div>
  );
}

/** "12 minutes" — how long until a bell can be rung again. */
function cooldown(lastNudgeAt: string | null, now: number): string {
  if (!lastNudgeAt) return "";
  const left = 60 * 60 * 1000 - (now - new Date(lastNudgeAt).getTime());
  if (left <= 0) return "";
  const mins = Math.max(1, Math.round(left / 60000));
  return mins === 1 ? "1 min" : `${mins} min`;
}

/** How long ago, kept vague on purpose — see the note in useFriends. */
function ago(iso: string, now: number): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export type FriendsProps = {
  friends: FriendsState;
  /** Whether there is an account. Everything here needs one. */
  signedIn: boolean;
  /**
   * A `?friend=` code the launch picked up and has not redeemed yet, with the
   * outcome once it has. Owned by the shell rather than here because the code
   * arrives before this page is built — and survives a trip through sign-in.
   */
  pendingInvite: string | null;
  inviteResult: { error: FriendsError | null } | null;
  /** Redeems it. The shell owns the outcome, and clears the stored code. */
  onAcceptInvite: () => void;
  onDismissInvite: () => void;
  onSignIn: () => void;
};

export default function Friends({
  friends,
  signedIn,
  pendingInvite,
  inviteResult,
  onAcceptInvite,
  onDismissInvite,
  onSignIn,
}: FriendsProps) {
  const now = useNow();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPersonRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [intention, setIntention] = useState("");
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FriendsError | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /* Search runs a beat after typing stops. A request per keystroke is a
     request per keystroke, and the answer to "jos" is thrown away by the time
     "joseph" is typed. */
  const debounce = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(debounce.current);
    if (query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = window.setTimeout(() => {
      friends
        .search(query)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 280);
    return () => window.clearTimeout(debounce.current);
  }, [query, friends]);

  /** Runs one action, shows whatever it said, and clears the last message. */
  const run = useCallback(
    async (fn: () => Promise<FriendsError | null>, ok?: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      setSaid(null);
      const err = await fn();
      setError(err);
      if (!err && ok) setSaid(ok);
      setBusy(false);
      return err;
    },
    [busy],
  );

  /* -------------------------------------------------- signed out ---------- */

  if (!signedIn) {
    return (
      <div style={{ ...card, padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Pray alongside people you know</div>
        <div style={{ fontSize: 14, lineHeight: 1.75, color: "var(--soft-2)" }}>
          Add friends to see their streaks, share what you are praying for, and send a
          gentle reminder when you think of them.
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--dim)" }}>
          {pendingInvite
            ? // The whole reason this person is here. The code is kept for the
              // length of the visit, so it is still waiting when they return.
              "Someone invited you. Sign in and the invitation will be here waiting — you will be friends in one tap."
            : "Sign in first — friends are tied to an account, not to this device."}
        </div>
        <div>
          <button type="button" style={button("accent")} onClick={onSignIn}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  const { list, incoming, outgoing, intentions, inviteUrl } = friends;

  /* -------------------------------------------------- one friend ---------- */

  const friendRow = (f: FriendOverviewRow) => {
    const name = f.display_name || f.username;
    const removing = confirmRemove === f.user_id;
    const wait = cooldown(f.last_nudge_at, now);

    return (
      <div
        key={f.user_id}
        style={{
          ...card,
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Avatar name={name} username={f.username} url={f.avatar_url} />

        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 3,
              fontSize: 12,
              color: "var(--dim-2)",
            }}
          >
            {/* A dot for today, a flame for the run of days. Nothing at all
                when they have turned sharing off — an empty space says "not
                shared", where a zero would say "has not prayed". */}
            {f.shares ? (
              <>
                <span
                  aria-hidden="true"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    flex: "none",
                    background: f.prayed_today
                      ? "rgb(var(--accent-rgb) / .95)"
                      : "rgb(var(--veil-rgb) / .2)",
                  }}
                />
                <span>{f.prayed_today ? "Prayed today" : "Not yet today"}</span>
                {f.streak > 0 && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      color: "var(--accent-ink)",
                    }}
                  >
                    <Flame />
                    {f.streak}
                  </span>
                )}
              </>
            ) : (
              <span>@{f.username}</span>
            )}
          </div>
        </div>

        {removing ? (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              style={{ ...button("danger"), padding: "7px 12px", fontSize: 12.5 }}
              onClick={() => {
                setConfirmRemove(null);
                void run(() => friends.remove(f.user_id));
              }}
            >
              Remove
            </button>
            <button
              type="button"
              style={{ ...button("quiet"), padding: "7px 12px", fontSize: 12.5 }}
              onClick={() => setConfirmRemove(null)}
            >
              Keep
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {/* The bell. Disabled from the database's own answer, and it says
                how long is left rather than only refusing. */}
            <button
              type="button"
              aria-label={
                f.can_nudge ? `Remind ${name} to pray` : `Already reminded ${name}`
              }
              disabled={!f.can_nudge || friends.ringing === f.user_id}
              onClick={() => void run(() => friends.nudge(f.user_id), `Reminder sent to ${name}.`)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "7px 10px",
                borderRadius: 999,
                fontSize: 11.5,
                fontFamily: "inherit",
                border: "1px solid",
                cursor: f.can_nudge ? "pointer" : "default",
                color: f.can_nudge ? "var(--accent-ink)" : "var(--dim-3)",
                borderColor: f.can_nudge
                  ? "rgb(var(--accent-rgb) / .28)"
                  : "rgb(var(--veil-rgb) / .08)",
                background: f.can_nudge ? "rgb(var(--accent-rgb) / .08)" : "transparent",
                transition: "color .25s ease, background .25s ease, border-color .25s ease",
                opacity: friends.ringing === f.user_id ? 0.5 : 1,
              }}
            >
              <Bell on={f.can_nudge} />
              {!f.can_nudge && wait && <span>{wait}</span>}
            </button>
            <button
              type="button"
              aria-label={`Remove ${name}`}
              onClick={() => setConfirmRemove(f.user_id)}
              style={{
                padding: "7px 8px",
                fontSize: 17,
                lineHeight: 1,
                color: "var(--dim-3)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              ⋯
            </button>
          </div>
        )}
      </div>
    );
  };

  /* ------------------------------------------------ one intention --------- */

  const intentionCard = (i: IntentionFeedRow) => {
    const name = i.mine ? "You" : i.display_name || i.username;
    return (
      <div key={i.id} style={{ ...card, padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <Avatar name={name} username={i.username} url={i.avatar_url} size={26} />
          <div style={{ fontSize: 13, fontWeight: 500, minWidth: 0, flex: 1 }}>{name}</div>
          <div style={{ fontSize: 11.5, color: "var(--dim-3)", flex: "none" }}>
            {ago(i.created_at, now)}
          </div>
        </div>

        <div
          style={{
            fontSize: 14.5,
            lineHeight: 1.7,
            color: "var(--body)",
            // Somebody else's words. Newlines they typed are kept, and the
            // string is rendered as text and never as markup.
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {i.body}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 12,
          }}
        >
          {i.mine ? (
            <button
              type="button"
              style={{ ...button("quiet"), padding: "7px 13px", fontSize: 12.5 }}
              onClick={() => void run(() => friends.close(i.id), "Closed.")}
            >
              Close
            </button>
          ) : (
            <button
              type="button"
              disabled={i.i_prayed}
              onClick={() => void friends.pray(i.id)}
              style={{
                ...button(i.i_prayed ? "quiet" : "accent"),
                padding: "7px 13px",
                fontSize: 12.5,
                cursor: i.i_prayed ? "default" : "pointer",
              }}
            >
              {i.i_prayed ? "You prayed" : "I prayed for this"}
            </button>
          )}
          <div style={{ fontSize: 12, color: "var(--dim-2)" }}>
            {i.prayed_count === 0
              ? "No one yet"
              : i.prayed_count === 1
                ? "1 person prayed"
                : `${i.prayed_count} people prayed`}
          </div>
        </div>
      </div>
    );
  };

  /* ------------------------------------------------------- the page ------- */

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      {/* An invitation link that was tapped. Answered before anything else on
          the page, because it is why this person is here. */}
      {(pendingInvite || inviteResult) && (
        <div
          style={{
            ...card,
            padding: 18,
            borderColor: "rgb(var(--accent-rgb) / .3)",
            background: "rgb(var(--accent-rgb) / .07)",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
            {inviteResult
              ? inviteResult.error
                ? "That invitation did not work"
                : "You are friends now"
              : "You were invited"}
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--soft-2)" }}>
            {inviteResult
              ? inviteResult.error
                ? SAYS[inviteResult.error]
                : "Their intentions and streak are below."
              : "Accepting adds you both to each other's friends list."}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {pendingInvite && !inviteResult && (
              <button
                type="button"
                style={button("accent")}
                onClick={onAcceptInvite}
              >
                Accept
              </button>
            )}
            <button type="button" style={button("quiet")} onClick={onDismissInvite}>
              {inviteResult ? "Done" : "Not now"}
            </button>
          </div>
        </div>
      )}

      {/* ---------------- waiting on you ---------------- */}
      {incoming.length > 0 && (
        <div>
          <div style={sectionLabel}>
            {incoming.length === 1 ? "1 friend request" : `${incoming.length} friend requests`}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {incoming.map((r) => {
              const name = r.display_name || r.username;
              return (
                <div
                  key={r.user_id}
                  style={{
                    ...card,
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    borderColor: "rgb(var(--accent-rgb) / .22)",
                  }}
                >
                  <Avatar name={name} username={r.username} url={r.avatar_url} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>{name}</div>
                    <div style={{ fontSize: 12, color: "var(--dim-2)", marginTop: 2 }}>
                      @{r.username}
                    </div>
                  </div>
                  <button
                    type="button"
                    style={{ ...button("accent"), padding: "8px 14px", fontSize: 13 }}
                    onClick={() => void run(() => friends.accept(r.user_id), `${name} is now a friend.`)}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    style={{ ...button("quiet"), padding: "8px 12px", fontSize: 13 }}
                    onClick={() => void run(() => friends.decline(r.user_id))}
                  >
                    Ignore
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------------- the wall ---------------- */}
      <div>
        <div style={sectionLabel}>Intentions</div>

        {composing ? (
          <div style={{ ...card, padding: 14, marginBottom: 10 }}>
            <textarea
              value={intention}
              autoFocus
              maxLength={280}
              rows={3}
              placeholder="What would you like your friends to pray for?"
              onChange={(e) => setIntention(e.target.value)}
              style={{
                appearance: "none",
                width: "100%",
                boxSizing: "border-box",
                resize: "none",
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--body)",
                fontFamily: "inherit",
                // 15px minimum or iOS Safari zooms the viewport on focus.
                fontSize: 15,
                lineHeight: 1.7,
              }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 8,
              }}
            >
              <div style={{ fontSize: 11.5, color: "var(--dim-3)", flex: 1 }}>
                {280 - intention.length} left · your friends are notified once
              </div>
              <button
                type="button"
                style={{ ...button("quiet"), padding: "8px 13px", fontSize: 13 }}
                onClick={() => {
                  setComposing(false);
                  setIntention("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!intention.trim() || busy}
                style={{
                  ...button("accent"),
                  padding: "8px 15px",
                  fontSize: 13,
                  opacity: intention.trim() && !busy ? 1 : 0.5,
                }}
                onClick={async () => {
                  const err = await run(() => friends.post(intention), "Shared with your friends.");
                  if (!err) {
                    setComposing(false);
                    setIntention("");
                  }
                }}
              >
                Share
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setComposing(true)}
            style={{
              ...card,
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "13px 16px",
              marginBottom: 10,
              fontFamily: "inherit",
              fontSize: 14,
              textAlign: "start",
              color: "var(--dim)",
              cursor: "pointer",
              borderStyle: "dashed",
            }}
          >
            <span style={{ color: "var(--accent-ink)", fontSize: 17, lineHeight: 1 }}>+</span>
            Ask your friends to pray for something
          </button>
        )}

        {intentions.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {intentions.map(intentionCard)}
          </div>
        ) : (
          <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--dim-2)", padding: "2px 2px" }}>
            Nothing on the wall right now. What you share here goes to your friends and
            nobody else.
          </div>
        )}
      </div>

      {/* ---------------- the list ---------------- */}
      <div>
        <div style={sectionLabel}>
          {list.length === 0
            ? "Friends"
            : list.length === 1
              ? "1 friend"
              : `${list.length} friends`}
        </div>
        {list.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {list.map(friendRow)}
          </div>
        ) : (
          <div style={{ ...card, padding: 18 }}>
            <div style={{ fontSize: 14, lineHeight: 1.75, color: "var(--soft-2)" }}>
              No friends yet. Send someone the invitation link below, or search for
              them by name.
            </div>
          </div>
        )}
        <Note error={error} ok={said} />
      </div>

      {/* ---------------- adding people ---------------- */}
      <div>
        <div style={sectionLabel}>Add a friend</div>

        <input
          value={query}
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search by name or @username"
          onChange={(e) => setQuery(e.target.value)}
          style={{
            appearance: "none",
            width: "100%",
            boxSizing: "border-box",
            background: "rgb(var(--veil-rgb) / .05)",
            border: "1px solid rgb(var(--veil-rgb) / .1)",
            borderRadius: 14,
            padding: "12px 14px",
            color: "var(--body)",
            fontFamily: "inherit",
            fontSize: 15,
          }}
        />

        {query.trim().length >= 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {searching && results.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--dim-2)" }}>Searching…</div>
            )}
            {!searching && results.length === 0 && (
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--dim-2)" }}>
                Nobody by that name. They may not have an account yet — the link below
                works for anyone.
              </div>
            )}
            {results.map((p) => {
              const name = p.display_name || p.username;
              return (
                <div
                  key={p.user_id}
                  style={{
                    ...card,
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                  }}
                >
                  <Avatar name={name} username={p.username} url={p.avatar_url} size={34} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 500 }}>{name}</div>
                    <div style={{ fontSize: 12, color: "var(--dim-2)", marginTop: 2 }}>
                      @{p.username}
                    </div>
                  </div>
                  {/* The button says what they already are, so nobody taps Add
                      on somebody they are already waiting to hear back from. */}
                  {p.relation === "friend" ? (
                    <span style={{ fontSize: 12.5, color: "var(--dim-2)" }}>Friend</span>
                  ) : p.relation === "outgoing" ? (
                    <span style={{ fontSize: 12.5, color: "var(--dim-2)" }}>Asked</span>
                  ) : p.relation === "incoming" ? (
                    <button
                      type="button"
                      style={{ ...button("accent"), padding: "7px 13px", fontSize: 12.5 }}
                      onClick={() =>
                        void run(async () => {
                          const err = await friends.accept(p.user_id);
                          if (!err) setResults((was) => was.filter((x) => x.user_id !== p.user_id));
                          return err;
                        }, `${name} is now a friend.`)
                      }
                    >
                      Accept
                    </button>
                  ) : (
                    <button
                      type="button"
                      style={{ ...button("quiet"), padding: "7px 13px", fontSize: 12.5 }}
                      onClick={() =>
                        void run(async () => {
                          const err = await friends.add(p.user_id);
                          if (!err) {
                            setResults((was) =>
                              was.map((x) =>
                                x.user_id === p.user_id ? { ...x, relation: "outgoing" } : x,
                              ),
                            );
                          }
                          return err;
                        }, `Request sent to ${name}.`)
                      }
                    >
                      Add
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---------------- the link ---------------- */}
      <div>
        <div style={sectionLabel}>Invite someone</div>
        <div style={{ ...card, padding: 16 }}>
          <div style={{ fontSize: 13.5, lineHeight: 1.75, color: "var(--soft-2)" }}>
            Send a link over WhatsApp. Whoever opens it becomes your friend once they
            sign in — no code to type.
          </div>

          {inviteUrl ? (
            <>
              <div
                dir="ltr"
                className="selectable"
                style={{
                  marginTop: 12,
                  padding: "11px 13px",
                  borderRadius: 12,
                  background: "rgb(var(--veil-rgb) / .05)",
                  border: "1px solid rgb(var(--veil-rgb) / .1)",
                  fontSize: 12.5,
                  color: "var(--dim)",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  overflowWrap: "anywhere",
                }}
              >
                {inviteUrl}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <button
                  type="button"
                  style={button("accent")}
                  onClick={() =>
                    void shareInvite(
                      inviteUrl,
                      "Pray with me on Unified Prayers —",
                    )
                  }
                >
                  Send invitation
                </button>
                <button
                  type="button"
                  style={button("quiet")}
                  onClick={async () => {
                    if (await copyInvite(inviteUrl)) {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 2500);
                    }
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  style={button("quiet")}
                  onClick={() => void friends.revokeInvite()}
                >
                  Revoke
                </button>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--dim-3)", lineHeight: 1.6, marginTop: 10 }}>
                Good for 14 days and up to 5 people. Revoking it stops the link working
                immediately — useful if it went to the wrong chat.
              </div>
            </>
          ) : (
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                style={button("accent")}
                onClick={() => void friends.makeInvite()}
              >
                Create an invitation link
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ---------------- sent, still waiting ---------------- */}
      {outgoing.length > 0 && (
        <div>
          <div style={sectionLabel}>Waiting to hear back</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {outgoing.map((r) => (
              <div
                key={r.user_id}
                style={{
                  ...card,
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                }}
              >
                <Avatar
                  name={r.display_name || r.username}
                  username={r.username}
                  url={r.avatar_url}
                  size={30}
                />
                <div style={{ minWidth: 0, flex: 1, fontSize: 13.5, color: "var(--soft-2)" }}>
                  {r.display_name || r.username}
                </div>
                <button
                  type="button"
                  style={{ ...button("quiet"), padding: "6px 12px", fontSize: 12.5 }}
                  onClick={() => void run(() => friends.cancel(r.user_id))}
                >
                  Withdraw
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          fontSize: 11.5,
          lineHeight: 1.7,
          color: "var(--dim-3)",
          transition: `opacity .3s ${EASE}`,
        }}
      >
        Friends see your streak and whether you have prayed today — never what you
        prayed or when. You can turn that off in Settings.
      </div>
    </div>
  );
}
