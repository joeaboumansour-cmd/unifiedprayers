"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MysteryKey, PrayerId } from "@/lib/content";
import { getSupabase } from "@/lib/supabase/client";
import {
  EMPTY_STATS,
  type PrayerSession,
  type Stats,
  computeStats,
  localDate,
  newSession,
  prune,
  readSessions,
  rowToSession,
  sessionToRow,
  writeSessions,
} from "@/lib/sessions";

/**
 * How far back the pull reaches. It has to cover the longest streak worth
 * showing plus the current month, and no further: the rest is history nobody
 * on the home screen is reading.
 */
const PULL_DAYS = 400;

export type StatsApi = {
  stats: Stats;
  /** Records a finished prayer. Safe to call signed out. */
  record: (prayer: PrayerId, mysterySet: MysteryKey | null, seconds: number) => void;
};

/**
 * The home-screen numbers, and the log they are counted from.
 *
 * The device's own log is the source of truth for what is rendered, signed in
 * or not. Supabase is a mirror of it: signing in uploads whatever this device
 * has and downloads whatever the account has, and both sides end up holding
 * the union. That is why the stats are real for a signed-out person too — they
 * simply never leave the phone.
 *
 * Rows are only ever added, never edited, so the merge is a union by client id
 * and there is nothing to reconcile.
 */
export function useStats(userId: string | null, ready: boolean): StatsApi {
  const [sessions, setSessions] = useState<PrayerSession[]>([]);
  // Recomputed at midnight and whenever the app comes back to the foreground,
  // so a streak does not sit there stale on a phone left open overnight.
  const [today, setToday] = useState(() => localDate());

  const latest = useRef(sessions);
  latest.current = sessions;

  /* ------------------------------- local ------------------------------- */

  useEffect(() => {
    if (!ready) return;
    setSessions(readSessions());
  }, [ready]);

  const merge = useCallback((incoming: PrayerSession[]) => {
    setSessions((prev) => {
      const next = prune([...incoming, ...prev]);
      writeSessions(next);
      return next;
    });
  }, []);

  /* -------------------------------- sync ------------------------------- */

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !userId || !ready) return;

    let live = true;

    (async () => {
      const since = new Date(Date.now() - PULL_DAYS * 24 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from("prayer_sessions")
        .select("*")
        .eq("user_id", userId)
        .gte("local_date", localDate(since))
        .order("local_date", { ascending: false });
      // Offline, or the table is not migrated yet. The local log still renders
      // the stats; the next launch tries the sync again.
      if (error || !live || !data) return;

      const remote = data.map(rowToSession);
      const known = new Set(remote.map((s) => s.clientId));
      // Whatever this device prayed while signed out, or while offline.
      const unsent = latest.current.filter((s) => !known.has(s.clientId));

      merge(remote);

      if (unsent.length > 0) {
        await supabase
          .from("prayer_sessions")
          .upsert(
            unsent.map((s) => sessionToRow(s, userId)),
            { onConflict: "user_id,client_id", ignoreDuplicates: true },
          );
      }
    })().catch(() => {
      /* silent by design: this is an offline-first PWA */
    });

    return () => {
      live = false;
    };
  }, [userId, ready, merge]);

  /* ------------------------------- record ------------------------------ */

  const record = useCallback(
    (prayer: PrayerId, mysterySet: MysteryKey | null, seconds: number) => {
      const session = newSession(prayer, mysterySet, seconds);
      merge([session]);
      setToday(localDate());

      const supabase = getSupabase();
      if (!supabase || !userId) return;
      // Not awaited, and a failure is not retried here: the row stays in the
      // local log without a match remotely, and the next sync uploads it.
      void supabase
        .from("prayer_sessions")
        .upsert(sessionToRow(session, userId), {
          onConflict: "user_id,client_id",
          ignoreDuplicates: true,
        })
        .then(() => {});
    },
    [merge, userId],
  );

  /* -------------------------------- clock ------------------------------ */

  useEffect(() => {
    const tick = () => setToday(localDate());
    // A minute is fine: nothing here is animated, it only has to be right by
    // the time someone looks at it after midnight.
    const id = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const stats = useMemo(
    () => (sessions.length === 0 ? EMPTY_STATS : computeStats(sessions)),
    // `today` is not read here: it is the signal that the calendar day rolled
    // over, which changes every number computeStats returns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, today],
  );

  return { stats, record };
}
