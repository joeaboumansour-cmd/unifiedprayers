"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { localDate } from "@/lib/sessions";

/**
 * Which of the day's readings this device has been through, and the streak
 * that comes of doing it.
 *
 * Deliberately separate from `useStats`. That counts finished *prayers*, its
 * rows sync to Supabase, and its `prayer` column is a two-value enum — so
 * folding readings into it would mean a migration, and would also quietly
 * inflate "prayers this month" with something that is not a rosary. The
 * devotions made the same choice for the same reason and keep their own state
 * in localStorage; this follows them.
 *
 * The unit of completion is the day, not the reading. A day is done when every
 * reading appointed for it has been opened, which is what makes the streak
 * mean "I read the day" rather than "I tapped something".
 */

const KEY = "up_readings_state_v1";

/** Long enough to outrun any streak worth showing, and no longer. */
const KEEP_DAYS = 400;

type DayState = {
  /** The `kind` of each reading opened, in no particular order. */
  read: string[];
  /** How many the day had when it was last looked at. */
  total: number;
  /** Set once every reading of the day has been opened. */
  done: boolean;
  at: number;
};

/** Keyed "YYYY-MM-DD|rite": two churches read different things on one day. */
type Log = Record<string, DayState>;

function read(): Log {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Log;
    const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
    const kept = Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v && typeof v.at === "number" && v.at > cutoff),
    );
    if (Object.keys(kept).length !== Object.keys(raw).length) {
      localStorage.setItem(KEY, JSON.stringify(kept));
    }
    return kept;
  } catch {
    return {};
  }
}

/** "2026-09-10|maronite". */
const keyFor = (day: string, rite: string) => `${day}|${rite}`;

/*
 * One log for the whole app, not one per caller.
 *
 * Two screens draw today's readings — the home/Today pair and the calendar's
 * entry for today — and each calls this hook. Left to their own `useState`
 * they would each hold the copy of localStorage they read at mount, so a
 * reading ticked on one would stay untouched on the other until a reload. So
 * the log lives here and the hook subscribes to it.
 */
let store: Log | null = null;
const listeners = new Set<(log: Log) => void>();

function load(): Log {
  if (store === null) store = read();
  return store;
}

function publish(next: Log) {
  store = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode — the place simply does not survive a reload */
  }
  for (const l of listeners) l(next);
}

/** The day `n` days before `from`, on the device's own calendar. */
function dayBefore(from: Date, n: number): string {
  return localDate(new Date(from.getFullYear(), from.getMonth(), from.getDate() - n));
}

export type ReadingProgress = {
  /** Whether this reading has been opened today. */
  isRead: (kind: string) => boolean;
  /** How many of the day's readings are done. */
  count: number;
  /** Every reading of the day has been opened. */
  complete: boolean;
  /** The moment it became complete, for the animation to fire once. */
  justCompleted: boolean;
  /** Consecutive days, ending today or yesterday, that were read through. */
  streak: number;
  /** Records an opened reading. Idempotent. */
  open: (kind: string) => void;
};

export function useReadingProgress(
  day: string,
  rite: string,
  kinds: string[],
): ReadingProgress {
  const [log, setLog] = useState<Log>({});
  const [loaded, setLoaded] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  // Read in an effect, never during render: the first paint has to match the
  // server's, which has no localStorage to read.
  useEffect(() => {
    setLog(load());
    setLoaded(true);
    listeners.add(setLog);
    return () => {
      listeners.delete(setLog);
    };
  }, []);

  const key = keyFor(day, rite);
  const state = log[key];
  const total = kinds.length;

  const isRead = useCallback(
    (kind: string) => Boolean(log[key]?.read.includes(kind)),
    [log, key],
  );

  const open = useCallback(
    (kind: string) => {
      const prev = load();
      const was = prev[key];
      if (was?.read.includes(kind)) return;

      const readNow = [...(was?.read ?? []), kind];
      const complete = total > 0 && readNow.length >= total;
      // Fire the completion animation on the edge only, never on a re-render
      // or on re-opening a day that was already finished.
      if (complete && !was?.done) setJustCompleted(true);

      publish({
        ...prev,
        [key]: { read: readNow, total, done: complete, at: Date.now() },
      });
    },
    [key, total],
  );

  /*
   * The streak, counted the way `computeStats` counts the prayer one so the
   * two read as the same idea: an unread today does not end it, because the
   * day is not over yet.
   *
   * A day counts if it was finished in *any* rite. Someone who reads the
   * Maronite lectionary on weekdays and goes to a Melkite liturgy on Sunday
   * has not missed a day, and a streak that punished them for it would be
   * measuring the wrong thing.
   */
  const streak = useMemo(() => {
    if (!loaded) return 0;
    const done = new Set(
      Object.entries(log)
        .filter(([, v]) => v.done)
        .map(([k]) => k.split("|")[0]),
    );
    const now = new Date();
    let n = 0;
    let offset = done.has(localDate(now)) ? 0 : 1;
    while (done.has(dayBefore(now, offset))) {
      n += 1;
      offset += 1;
    }
    return n;
  }, [log, loaded]);

  return {
    isRead,
    count: state?.read.filter((k) => kinds.includes(k)).length ?? 0,
    complete: total > 0 && (state?.read.filter((k) => kinds.includes(k)).length ?? 0) >= total,
    justCompleted,
    streak,
    open,
  };
}
