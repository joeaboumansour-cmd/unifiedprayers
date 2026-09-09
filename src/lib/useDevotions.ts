"use client";

import { useCallback, useEffect, useState } from "react";

import type { Lang } from "@/lib/content";
import { onForeground } from "@/lib/live";
import { getSupabase } from "@/lib/supabase/client";
import type { DevotionRow, DevotionTrack } from "@/lib/supabase/types";

/**
 * Today's page from each of the two devotional books.
 *
 * The seal is in the database — the policy in 0008 will not return a page
 * whose day has not arrived — so nothing here is guarding anything. What this
 * file does is ask for the right day, keep the answer for the rest of the day
 * so a phone with no signal still has it, and remember how far into each page
 * this device has got — so a devotion put down halfway can be picked up from
 * the home screen rather than started again.
 *
 * The cache is keyed by the local date and thrown away when the date changes.
 * Yesterday's page shown today would not be a stale verse, it would be the
 * wrong page of a book, so there is no reason to keep it.
 */

const CACHE_KEY = "up_devotions_v1";
/** Where each page was left, and whether it was finished. */
const STATE_KEY = "up_devotions_state_v1";

/** Re-asked at most this often while the app is open. */
const MAX_AGE_MS = 15 * 60 * 1000;

/** How long a page's state is kept. Long enough to outlive a year of pages. */
const STATE_TTL_MS = 400 * 24 * 60 * 60 * 1000;

export const TRACKS: DevotionTrack[] = ["individual", "couples"];

/** One page, resolved into the reader's language. */
export type Devotion = {
  id: string;
  track: DevotionTrack;
  title: string;
  verse: string;
  verseRef: string | null;
  paragraphs: string[];
  quote: string | null;
  quoteSource: string | null;
};

/**
 * How far into a page this device has got today.
 *
 * `shown` counts blocks uncovered, `total` is how many the page has — kept
 * beside it rather than recomputed, because the home screen wants to draw a
 * progress bar without knowing how a devotion is cut into blocks.
 */
export type DevotionState = {
  shown: number;
  total: number;
  done: boolean;
  at: number;
};

export type Devotions = {
  /** Null for a book with no page for today, or before the fetch lands. */
  byTrack: Record<DevotionTrack, Devotion | null>;
  /** True once an answer — including "there is none" — is in hand. */
  ready: boolean;
  /** Whether this device has already been through that page today. */
  isRead: (track: DevotionTrack) => boolean;
  /** Where today's page was left, or null if it was never opened. */
  stateOf: (track: DevotionTrack) => DevotionState | null;
  /** Opened, not finished — the thing the resume list is built from. */
  isUnfinished: (track: DevotionTrack) => boolean;
  /** Called on every reveal, so closing the reader does not lose the place. */
  saveProgress: (track: DevotionTrack, shown: number, total: number) => void;
  markRead: (track: DevotionTrack) => void;
};

type Cached = { date: string; at: number; rows: DevotionRow[] };

/** The device's own calendar date. Also the cache key. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA").format(new Date());
}

function readCache(): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cached;
    return c?.date === today() && Array.isArray(c.rows) ? c : null;
  } catch {
    return null;
  }
}

function readState(): Record<string, DevotionState> {
  try {
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) || "{}") as Record<
      string,
      DevotionState
    >;
    const cutoff = Date.now() - STATE_TTL_MS;
    const kept = Object.fromEntries(
      Object.entries(raw).filter(
        ([, v]) => v && typeof v.at === "number" && v.at > cutoff,
      ),
    );
    if (Object.keys(kept).length !== Object.keys(raw).length) {
      localStorage.setItem(STATE_KEY, JSON.stringify(kept));
    }
    return kept;
  } catch {
    return {};
  }
}

/**
 * A field in the reader's language, falling back to the Arabic.
 *
 * The books are Arabic on paper and a translation may never be typed, so an
 * English reader gets the Arabic rather than a blank — the same choice the
 * schema makes by leaving the English columns nullable. A page half in one
 * language reads worse than a page wholly in the other, so the fallback is per
 * field and not per row on purpose: only the parts that are missing switch.
 */
const pick = (en: string | null | undefined, ar: string): string =>
  en && en.trim() ? en : ar;

function toDevotion(r: DevotionRow, lang: Lang): Devotion {
  const en = lang === "en";
  const body = en && r.body_en?.length ? r.body_en : r.body_ar;
  return {
    id: r.id,
    track: r.track,
    title: en ? pick(r.title_en, r.title_ar) : r.title_ar,
    verse: en ? pick(r.verse_en, r.verse_ar) : r.verse_ar,
    verseRef: (en ? r.verse_ref_en || r.verse_ref_ar : r.verse_ref_ar) || null,
    paragraphs: body.filter((p) => p.trim()),
    quote: (en ? r.quote_en || r.quote_ar : r.quote_ar) || null,
    quoteSource:
      (en ? r.quote_source_en || r.quote_source_ar : r.quote_source_ar) || null,
  };
}

export function useDevotions(lang: Lang): Devotions {
  const [rows, setRows] = useState<DevotionRow[] | null>(null);
  const [date, setDate] = useState(today);
  const [log, setLog] = useState<Record<string, DevotionState>>({});

  useEffect(() => setLog(readState()), []);

  useEffect(() => {
    const cache = readCache();
    if (cache) setRows(cache.rows);

    const supabase = getSupabase();
    if (!supabase) {
      // No backend configured. Say so rather than leaving the cards in a
      // loading state that will never end.
      if (!cache) setRows([]);
      return;
    }

    let live = true;
    let fetchedAt = cache?.at ?? 0;
    // The day the rows in hand belong to. Held here rather than read off state
    // because this closure is created once and would never see the update.
    let held = today();

    const refresh = async () => {
      if (!live) return;
      const now = new Date();
      const stamp = new Intl.DateTimeFormat("en-CA").format(now);
      // Midnight passed with the app still open. What is in hand is yesterday's
      // page, so it goes before the new one is asked for.
      if (stamp !== held) {
        held = stamp;
        setDate(stamp);
        setRows(null);
      } else if (Date.now() - fetchedAt < MAX_AGE_MS) {
        return;
      }

      try {
        const { data, error } = await supabase
          .from("daily_devotions")
          .select("*")
          // The device's own month and day. An admin's "read all" policy would
          // otherwise hand them the whole book; asking for one day is what
          // keeps their home screen the same as everybody else's.
          .eq("month", now.getMonth() + 1)
          .eq("day", now.getDate())
          .eq("active", true);

        if (!live) return;
        if (error || !data) {
          // A refused or failed query is not a reason to leave two cards
          // spinning forever. With nothing in hand the honest answer is "there
          // is nothing for today"; with a cached copy, that copy stands.
          setRows((r) => r ?? []);
          return;
        }
        fetchedAt = Date.now();
        setRows(data);
        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ date: stamp, at: fetchedAt, rows: data } satisfies Cached),
          );
        } catch {
          /* private mode — it just asks again next launch */
        }
      } catch {
        // Offline. The cache above covers a device that has been here today;
        // one that has not sees the cards as empty, which is the truth.
        if (!live) return;
        setRows((r) => r ?? []);
      }
    };

    void refresh();
    // A phone left on the home screen overnight is on yesterday's page until
    // something asks again. Coming back into the foreground is that something.
    const stop = onForeground(() => void refresh(), 5 * 60 * 1000);

    return () => {
      live = false;
      stop();
    };
  }, []);

  /** One write, so the two callers below cannot disagree about the shape. */
  const put = useCallback(
    (track: DevotionTrack, patch: Omit<DevotionState, "at">) => {
      const key = `${date}:${track}`;
      setLog((prev) => {
        const was = prev[key];
        // Nothing to say. Without this, every reveal that lands on the same
        // block — a re-render, a repeated tap — writes localStorage again.
        if (
          was &&
          was.done === patch.done &&
          was.shown === patch.shown &&
          was.total === patch.total
        ) {
          return prev;
        }
        // A page finished earlier today stays finished. Re-reading it walks the
        // blocks again from the top, and that must not put it back on the
        // resume list halfway through.
        if (was?.done && !patch.done) return prev;

        const next = { ...prev, [key]: { ...patch, at: Date.now() } };
        try {
          localStorage.setItem(STATE_KEY, JSON.stringify(next));
        } catch {
          /* private mode — the place just does not survive a reload */
        }
        return next;
      });
    },
    [date],
  );

  const stateOf = useCallback(
    (track: DevotionTrack) => log[`${date}:${track}`] ?? null,
    [log, date],
  );

  const isRead = useCallback(
    (track: DevotionTrack) => Boolean(stateOf(track)?.done),
    [stateOf],
  );

  /* Opened and left. `shown > 1` rather than `>= 1` on purpose: a page that
     was opened and closed on its title has not been started, it has been
     glanced at, and offering to "continue" it would be offering the beginning. */
  const isUnfinished = useCallback(
    (track: DevotionTrack) => {
      const st = stateOf(track);
      return Boolean(st && !st.done && st.shown > 1 && st.shown < st.total);
    },
    [stateOf],
  );

  const saveProgress = useCallback(
    (track: DevotionTrack, shown: number, total: number) =>
      put(track, { shown, total, done: false }),
    [put],
  );

  const markRead = useCallback(
    (track: DevotionTrack) => {
      const total = stateOf(track)?.total ?? 1;
      put(track, { shown: total, total, done: true });
    },
    [put, stateOf],
  );

  const byTrack = {
    individual: null,
    couples: null,
  } as Record<DevotionTrack, Devotion | null>;
  for (const r of rows ?? []) byTrack[r.track] = toDevotion(r, lang);

  return {
    byTrack,
    ready: rows !== null,
    isRead,
    stateOf,
    isUnfinished,
    saveProgress,
    markRead,
  };
}
