import type { MysteryKey, PrayerId } from "@/lib/content";
import type { PrayerSessionRow } from "@/lib/supabase/types";

export const SESSIONS_KEY = "up_sessions_v1";

/**
 * How much history is kept on the device. The stats above need a year at most
 * (a streak, and the current month), and an unbounded array in localStorage
 * would eventually be the reason the app stops saving anything at all.
 */
const KEEP_DAYS = 400;

/** Longer than this and the app was left open, not prayed. */
const MAX_SECONDS = 3 * 60 * 60;

/**
 * One finished prayer. Written when the closing moment fires, never on a
 * prayer that was merely left, so the stats mean what they say.
 */
export type PrayerSession = {
  /**
   * Made on the device. It is the identity of the session everywhere: the
   * upload is keyed on it, so re-uploading the same local log is a no-op
   * rather than a second row.
   */
  clientId: string;
  prayer: PrayerId;
  mysterySet: MysteryKey | null;
  /** Epoch ms, device clock. */
  finishedAt: number;
  /**
   * The calendar day on the device that finished it, `YYYY-MM-DD`. Stored
   * rather than derived, because a streak is counted in the days the person
   * lived through, and recomputing it from UTC in another timezone would move
   * prayers across midnight.
   */
  localDate: string;
  seconds: number;
};

export type Stats = {
  /** Consecutive local days ending today (or yesterday, if today is unprayed). */
  streak: number;
  /** Finished prayers this calendar month. */
  monthPrayers: number;
  /** Whole minutes prayed this calendar month. */
  monthMinutes: number;
  /** Oldest to newest, the last seven days, true where a prayer finished. */
  week: boolean[];
  /** Every finished prayer on record. */
  total: number;
};

export const EMPTY_STATS: Stats = {
  streak: 0,
  monthPrayers: 0,
  monthMinutes: 0,
  week: [false, false, false, false, false, false, false],
  total: 0,
};

/* --------------------------------- dates --------------------------------- */

/** `YYYY-MM-DD` in the device's own timezone, never UTC. */
export function localDate(at: Date | number = Date.now()): string {
  const d = at instanceof Date ? at : new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `n` days before `from`, as a local date key. */
function dayBefore(from: Date, n: number): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() - n);
  return localDate(d);
}

/* --------------------------------- local --------------------------------- */

function makeClientId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Older WebKit, and any non-secure context. Uniqueness only has to hold
    // against this device's own log.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Newest first, malformed entries dropped rather than thrown over. */
export function readSessions(): PrayerSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSession).sort((a, b) => b.finishedAt - a.finishedAt);
  } catch {
    return []; // private mode, or a corrupt blob — no stats beats no app
  }
}

function isSession(v: unknown): v is PrayerSession {
  const s = v as Partial<PrayerSession> | null;
  return (
    !!s &&
    typeof s.clientId === "string" &&
    typeof s.finishedAt === "number" &&
    typeof s.localDate === "string" &&
    typeof s.seconds === "number"
  );
}

export function writeSessions(list: PrayerSession[]): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(prune(list)));
  } catch {
    /* private mode, or the quota is full — stats degrade, the app does not */
  }
}

/** Newest first, one row per clientId, trimmed to the window kept on device. */
export function prune(list: PrayerSession[]): PrayerSession[] {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  const seen = new Set<string>();
  const out: PrayerSession[] = [];
  for (const s of [...list].sort((a, b) => b.finishedAt - a.finishedAt)) {
    if (seen.has(s.clientId) || s.finishedAt < cutoff) continue;
    seen.add(s.clientId);
    out.push(s);
  }
  return out;
}

/** Builds the record of a prayer that has just finished. */
export function newSession(
  prayer: PrayerId,
  mysterySet: MysteryKey | null,
  seconds: number,
): PrayerSession {
  const finishedAt = Date.now();
  return {
    clientId: makeClientId(),
    prayer,
    mysterySet,
    finishedAt,
    localDate: localDate(finishedAt),
    // A negative clock adjustment, or a prayer left open overnight, must not
    // put an impossible number of minutes on the home screen.
    seconds: Math.max(0, Math.min(MAX_SECONDS, Math.round(seconds))),
  };
}

/* ---------------------------------- math --------------------------------- */

export function computeStats(
  sessions: PrayerSession[],
  now: Date = new Date(),
): Stats {
  if (sessions.length === 0) return EMPTY_STATS;

  const days = new Set(sessions.map((s) => s.localDate));

  // Today counts once it has a prayer in it, but an unprayed today does not
  // end the streak — the day is not over. So the count starts at whichever of
  // today and yesterday was prayed.
  const today = localDate(now);
  let streak = 0;
  let offset = days.has(today) ? 0 : 1;
  while (days.has(dayBefore(now, offset))) {
    streak += 1;
    offset += 1;
  }

  const monthPrefix = today.slice(0, 7);
  let monthPrayers = 0;
  let monthSeconds = 0;
  for (const s of sessions) {
    if (!s.localDate.startsWith(monthPrefix)) continue;
    monthPrayers += 1;
    monthSeconds += s.seconds;
  }

  // Oldest first, so the dots read left to right as the week did.
  const week = Array.from({ length: 7 }, (_, i) =>
    days.has(dayBefore(now, 6 - i)),
  );

  return {
    streak,
    monthPrayers,
    monthMinutes: Math.round(monthSeconds / 60),
    week,
    total: sessions.length,
  };
}

/* ----------------------------- local <-> database ------------------------ */

export const sessionToRow = (
  s: PrayerSession,
  userId: string,
): PrayerSessionRow => ({
  user_id: userId,
  client_id: s.clientId,
  prayer: s.prayer,
  mystery_set: s.mysterySet,
  finished_at: new Date(s.finishedAt).toISOString(),
  local_date: s.localDate,
  seconds: s.seconds,
});

export const rowToSession = (r: PrayerSessionRow): PrayerSession => ({
  clientId: r.client_id,
  prayer: r.prayer,
  mysterySet: r.mystery_set,
  finishedAt: Date.parse(r.finished_at),
  localDate: r.local_date,
  seconds: r.seconds,
});
