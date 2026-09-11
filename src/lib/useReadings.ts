"use client";

import { useEffect, useMemo, useState } from "react";

import type { Lang } from "@/lib/content";
import { getSupabase } from "@/lib/supabase/client";
import type { Reading, ReadingRow } from "@/lib/supabase/types";
import type { Rite } from "@/lib/liturgy";

/**
 * The readings appointed for one day in one church, in the reader's language
 * where the mirror has them in it.
 *
 * The only part of the Calendar tab that asks the network anything. Everything
 * else — nine churches' seasons, every feast of every year — is arithmetic over
 * a table in the bundle and works in flight mode. The readings cannot be:
 * which passages are appointed for a given day is published by a liturgical
 * commission, not implied by a date, so they are mirrored into Supabase
 * nightly (see the cron route) and read from there.
 *
 * Which means this hook has to be comfortable coming back with nothing, and
 * often will: for a date outside the mirror's archive, for one of the Orthodox
 * rites no source covers, or simply offline. Nothing is the normal answer here,
 * and the UI treats it as one rather than as a failure.
 *
 * A day can be mirrored in more than one language (migration 0012). Every row
 * for the day is fetched once and the language is chosen here, so flipping the
 * app between Arabic and English swaps the text without asking again — and a
 * church whose source has only one language still shows it to everybody.
 */

type RowLang = NonNullable<ReadingRow["lang"]>;

export type DayReadings = {
  readings: Reading[];
  /** What the text is in — for `dir`, when it is not the app's language. */
  lang: RowLang;
  /** The day's title as the source names it — not as this app computes it. */
  sourceTitle: string | null;
  /** Whose translation. Shown with the text, always. */
  translation: string | null;
  source: string;
  audioUrl: string | null;
};

export type ReadingsState = {
  data: DayReadings | null;
  loading: boolean;
};

type Fetched = Pick<ReadingRow, "readings" | "liturgic_title" | "translation" | "source" | "audio_url" | "lang" | "rite">;

/** Everything already fetched this session, keyed date + rite: every language. */
const cache = new Map<string, DayReadings[]>();

/**
 * The language of a row, including one written before 0012 gave rows a `lang`.
 * Until then each rite had exactly one source and so exactly one language.
 */
function rowLang(row: Fetched): RowLang {
  if (row.lang) return row.lang;
  if (row.source === "orthocal.info") return "en";
  return row.rite === "armenian" ? "hy" : "ar";
}

/**
 * evangelizo's numbered slots, renumbered in order.
 *
 * The same Maronite day puts its epistle in slot three in Arabic and slot two
 * in English, and `kind` is what the reading progress remembers — so without
 * this, a reading finished in Arabic would come back unread in English. The
 * gospel keeps its own name in both, and orthocal's kinds already agree across
 * languages because both rows are built from one response.
 */
function evenSlots(readings: Reading[]): Reading[] {
  let n = 0;
  return readings.map((r) => (/^text[123]$/.test(r.kind) ? { ...r, kind: `text${++n}` } : r));
}

function toDay(row: Fetched): DayReadings {
  return {
    readings: evenSlots(Array.isArray(row.readings) ? row.readings : []),
    lang: rowLang(row),
    sourceTitle: row.liturgic_title,
    translation: row.translation,
    source: row.source,
    audioUrl: row.audio_url,
  };
}

/** The reader's language if the day has it; otherwise whichever it does have. */
function pick(days: DayReadings[], lang: Lang): DayReadings | null {
  const other: Lang = lang === "ar" ? "en" : "ar";
  return (
    days.find((d) => d.lang === lang && d.readings.length) ??
    days.find((d) => d.lang === other && d.readings.length) ??
    days.find((d) => d.readings.length) ??
    days[0] ??
    null
  );
}

/**
 * The language and direction one reading's words are set in. Usually the
 * app's, but not always: an English reader of the Melkite calendar gets Arabic,
 * and English inside a right-to-left page scatters its punctuation.
 */
export function readingScript(r: Reading, day: DayReadings): { lang: RowLang; dir: "rtl" | "ltr" } {
  const lang = r.lang ?? day.lang;
  return { lang, dir: lang === "ar" ? "rtl" : "ltr" };
}

export function useReadings(dayKey: string, rite: Rite, lang: Lang): ReadingsState {
  const key = `${dayKey}|${rite}`;
  const [state, setState] = useState<{ days: DayReadings[]; loading: boolean }>(() =>
    cache.has(key) ? { days: cache.get(key)!, loading: false } : { days: [], loading: true },
  );

  useEffect(() => {
    if (cache.has(key)) {
      setState({ days: cache.get(key)!, loading: false });
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setState({ days: [], loading: false });
      return;
    }

    let live = true;
    setState({ days: [], loading: true });

    void (async () => {
      /* `*` rather than a column list that names `lang`: before 0012 is applied
         that column does not exist, and naming it would fail the whole query
         and take the readings off every screen until the migration ran. */
      const { data } = await supabase
        .from("daily_readings")
        .select("*")
        .eq("on_date", dayKey)
        .eq("rite", rite)
        .returns<Fetched[]>();

      const days = (data ?? []).map(toDay);

      // Cached either way. A day the mirror has nothing for will still have
      // nothing on the next tap, and asking again for every one of them would
      // be a request per day scrolled past.
      cache.set(key, days);
      if (live) setState({ days, loading: false });
    })().catch(() => {
      // Offline, or the table does not exist yet because migration 0010 has
      // not been applied. Neither is worth a message: the day still has its
      // feasts, its season and its saints, which is the calendar's actual job.
      if (live) setState({ days: [], loading: false });
    });

    return () => {
      live = false;
    };
  }, [key, dayKey, rite]);

  const data = useMemo(() => pick(state.days, lang), [state.days, lang]);
  return { data, loading: state.loading };
}
