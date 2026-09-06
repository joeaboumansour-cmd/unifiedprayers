"use client";

import { useEffect, useState } from "react";

import type { Lang } from "@/lib/content";
import { getSupabase } from "@/lib/supabase/client";
import type { VerseRow } from "@/lib/supabase/types";

/** Verses fetched previously, so today's still shows with no connection. */
const CACHE_KEY = "up_verses_v1";
/** Re-fetched at most this often; the list changes rarely and is small. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export type Verse = { text: string; ref: string | null };

type Cached = { at: number; rows: PoolRow[] };
type PoolRow = Pick<
  VerseRow,
  | "id" | "text_ar" | "text_en" | "ref_ar" | "ref_en"
  | "show_on" | "active" | "sort" | "created_at"
>;

/** The device's own calendar date, as the `show_on` column stores it. */
function today(): string {
  // en-CA is YYYY-MM-DD. Building it from the local parts rather than
  // toISOString(), which would answer with the UTC date and put a verse on the
  // wrong day for anyone east of London late in the evening.
  return new Intl.DateTimeFormat("en-CA").format(new Date());
}

/** Whole days since the epoch, in local time. The rotation's cursor. */
function dayNumber(): number {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor(midnight.getTime() / 86_400_000);
}

function read(): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
}

/**
 * Today's verse out of a list.
 *
 * A verse pinned to today wins outright — that is what pinning is for. With
 * none pinned, the unpinned rows form a pool that advances one per day, so a
 * handful of verses covers an indefinite stretch without anyone touching it.
 * The pool is ordered by `sort` so that order is a decision, not an accident of
 * insertion time.
 */
function pick(all: PoolRow[], lang: Lang): Verse | null {
  /* The policy already hides inactive verses from a reader. It does not hide
     them from an admin, whose "read all" policy returns the switched-off ones
     too — so without this an admin would be the only person seeing a verse they
     had just turned off. Filtered here rather than in the query so the same
     rule covers the cached copy. */
  const rows = all.filter((r) => r.active);
  if (!rows.length) return null;

  const day = today();
  const pinned = rows.find((r) => r.show_on === day);
  const pool = rows.filter((r) => !r.show_on);

  const chosen =
    pinned ??
    (pool.length
      ? [...pool].sort(
          (a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at),
        )[dayNumber() % pool.length]
      : null);

  if (!chosen) return null;
  const text = lang === "ar" ? chosen.text_ar : chosen.text_en;
  if (!text?.trim()) return null;
  return { text, ref: (lang === "ar" ? chosen.ref_ar : chosen.ref_en) || null };
}

/**
 * The verse for today, or null to use the one bundled in the design document.
 *
 * Null is a normal answer, not a failure: before anyone has added a verse the
 * table is empty, and the app has always had a verse to show without one.
 * Nothing here blocks a render or reports an error.
 */
export function useVerse(lang: Lang): Verse | null {
  const [rows, setRows] = useState<PoolRow[] | null>(null);

  useEffect(() => {
    const cache = read();
    if (cache?.rows) setRows(cache.rows);
    if (cache && Date.now() - cache.at < MAX_AGE_MS) return;

    const supabase = getSupabase();
    if (!supabase) return;

    let live = true;
    (async () => {
      const { data, error } = await supabase
        .from("verses")
        .select("id, text_ar, text_en, ref_ar, ref_en, show_on, active, sort, created_at")
        .or(`show_on.is.null,show_on.eq.${today()}`)
        // A cap, so a table someone has been adding to for years cannot turn
        // the home screen into a large download.
        .limit(400);

      if (!live || error || !data) return;
      setRows(data);
      try {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ at: Date.now(), rows: data } satisfies Cached),
        );
      } catch {
        /* private mode — it just fetches again next launch */
      }
    })().catch(() => {
      /* offline; the cache above, or the bundled verse, covers it */
    });

    return () => {
      live = false;
    };
  }, []);

  return rows ? pick(rows, lang) : null;
}
