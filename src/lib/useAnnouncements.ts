"use client";

import { useCallback, useEffect, useState } from "react";

import { getSupabase } from "@/lib/supabase/client";
import type { AnnouncementRow } from "@/lib/supabase/types";

/**
 * Messages the app shows on top of itself: a banner on the Prayers tab, a modal
 * on open.
 *
 * Dismissals are local, not a row in the database, and that is deliberate. The
 * app is fully usable signed out, so a great many readers have no account to
 * attach a dismissal to; storing it per device is the only rule that works the
 * same for everyone. The cost is that dismissing on a phone does not dismiss on
 * a laptop, which for a message meant to be seen once per device is right
 * anyway.
 */

const DISMISS_KEY = "up_dismissed_v1";
/** Kept fresh enough that switching a message off takes effect the same visit. */
const MAX_AGE_MS = 15 * 60 * 1000;
const CACHE_KEY = "up_announcements_v1";

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
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

export function useAnnouncements(signedIn: boolean): {
  banner: AnnouncementRow | null;
  modal: AnnouncementRow | null;
  dismiss: (id: string) => void;
} {
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [dismissed, setDismissed] = useState<Record<string, number>>({});

  useEffect(() => {
    setDismissed(readDismissed());

    try {
      const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "null") as Cached | null;
      if (cache?.rows) setRows(cache.rows.filter(isLive));
      if (cache && Date.now() - cache.at < MAX_AGE_MS) return;
    } catch {
      /* fall through to the fetch */
    }

    const supabase = getSupabase();
    if (!supabase) return;

    let live = true;
    (async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20);

      if (!live || error || !data) return;
      const rows = data.filter(isLive);
      setRows(rows);
      try {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ at: Date.now(), rows } satisfies Cached),
        );
      } catch {
        /* private mode */
      }
    })().catch(() => {
      /* offline — whatever was cached still shows, which is the point */
    });

    return () => {
      live = false;
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
    if (r.audience === "signed_in" && !signedIn) return false;
    if (r.audience === "signed_out" && signedIn) return false;
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
