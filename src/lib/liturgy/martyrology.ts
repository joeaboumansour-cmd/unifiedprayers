"use client";

/**
 * The wider memory: everyone else remembered on a given day.
 *
 * Deliberately not part of the calendar. `index.ts` answers the question "what
 * does my church celebrate today", and its answer is short, ranked and
 * coloured. This answers a different one — "who else is this day for" — and its
 * answer is five and a half thousand names, most of which no parish will ever
 * mention. Keeping them apart is what stops the second from drowning the first.
 *
 * Loaded on demand, and that is the point of this file existing at all. The
 * table is 380 KB, which is bigger than the entire rest of the app; bundling it
 * would make every reader pay, on every launch, for a list most of them will
 * never open. So it is a dynamic import, fetched the first time somebody looks
 * at a day, held for the session afterwards, and cached by the service worker
 * under a content-hashed URL like any other chunk — which means it is offline
 * from the second launch onwards without being in the way of the first.
 */

import type { Lang } from "@/lib/content";

/** One remembered name. Keys are short because there are 5,522 of them. */
type Row = {
  /** Name, in English. */
  n: string;
  /** Name in Arabic, where Wikidata has one. */
  a?: string;
  /** English Wikipedia article title. Every row has one. */
  w: string;
  /** Arabic Wikipedia article title. */
  aw?: string;
  /** Year of death — for most saints, the reason the day is theirs. */
  d?: number;
};

type Table = { days: Record<string, Row[]> };

/** A saint resolved for one reader. */
export type Remembered = {
  name: string;
  /** "d. 546", or null where the year is unknown. */
  died: number | null;
  link: string;
};

let cache: Table | null = null;
let inFlight: Promise<Table> | null = null;

/**
 * Loads the table, once.
 *
 * The in-flight promise is shared rather than the import being called again:
 * a reader tapping through four days in a second would otherwise start four
 * loads of the same 380 KB before the first resolved.
 */
async function load(): Promise<Table> {
  if (cache) return cache;
  inFlight ??= import("@/data/liturgy/martyrology.json")
    .then((m) => {
      cache = (m.default ?? m) as unknown as Table;
      return cache;
    })
    .catch((e) => {
      // A failed chunk must not poison the cache: clearing the in-flight
      // promise lets the next day the reader opens try again, which on a
      // flaky connection is exactly what should happen.
      inFlight = null;
      throw e;
    });
  return inFlight;
}

/**
 * Everyone remembered on a day, in the reader's language.
 *
 * `exclude` takes the ids and names already on screen as the day's actual
 * feasts, so the sheet does not list Mar Charbel underneath Mar Charbel. The
 * match is on the name because the two tables have no id in common — one is
 * hand-written and romcal's, the other is Wikidata's.
 */
export async function rememberedOn(
  key: string,
  lang: Lang,
  exclude: string[] = [],
): Promise<Remembered[]> {
  const table = await load();
  /* `key` is a Day's own key, "YYYY-MM-DD", and this table is keyed "MM-DD" —
     none of these commemorations belongs to a year. Taking the whole key
     silently matches nothing, which looks exactly like a day with no saints. */
  const rows = table.days[key.length > 5 ? key.slice(5) : key] ?? [];
  const ar = lang === "ar";

  const taken = new Set(exclude.map(norm));

  return rows
    .map((r): Remembered => {
      const title = ar ? (r.aw ?? r.w) : r.w;
      const host = ar && r.aw ? "ar" : "en";
      return {
        name: (ar ? (r.a ?? r.n) : r.n),
        died: r.d ?? null,
        link: `https://${host}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      };
    })
    .filter((r) => !taken.has(norm(r.name)));
}

/**
 * Enough of a name to tell two entries apart, and not so much that "Saint
 * Anne" and "Anne" read as different people.
 */
function norm(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      // Strip the combining marks NFD just split off, so "Thérèse" and
      // "Therese" compare equal.
      .replace(/[̀-ͯ]/g, "")
      // The honorific is not the name, in either language: the calendar says
      // "Mar Charbel" and Wikidata says "Charbel", and they are one man.
      .replace(/^(st|sts|saint|saints|mar|mor|the|bl|blessed)\s+/, "")
      .replace(/^(مار|القديس|القديسة|القديسان|القديسين|الطوباوي|الطوباوية|مري)\s+/, "")
      // Latin letters, digits, and the Arabic block. Everything else — spaces,
      // commas, the punctuation around honorifics — is noise for a comparison.
      .replace(/[^a-z0-9؀-ۿ]/g, "")
  );
}

/** Whether the table is already in memory — lets the UI skip a loading line. */
export const martyrologyReady = (): boolean => cache !== null;
