"use client";

import { useEffect, useState } from "react";

import { getSupabase } from "@/lib/supabase/client";
import type { Reading, ReadingRow } from "@/lib/supabase/types";
import type { Rite } from "@/lib/liturgy";

/**
 * The readings appointed for one day in one church.
 *
 * The only part of the Calendar tab that asks the network anything. Everything
 * else — nine churches' seasons, every feast of every year — is arithmetic over
 * a table in the bundle and works in flight mode. The readings cannot be:
 * which passages are appointed for a given day is published by a liturgical
 * commission, not implied by a date, so they are mirrored into Supabase
 * nightly (see the cron route) and read from there.
 *
 * Which means this hook has to be comfortable coming back with nothing, and
 * often will: for a date outside the mirror's archive, for one of the three
 * Orthodox rites the source does not cover, or simply offline. Nothing is the
 * normal answer here, and the UI treats it as one rather than as a failure.
 */

export type DayReadings = {
  readings: Reading[];
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

/** Everything already fetched this session, keyed date + rite. */
const cache = new Map<string, DayReadings | null>();

export function useReadings(dayKey: string, rite: Rite): ReadingsState {
  const key = `${dayKey}|${rite}`;
  const [state, setState] = useState<ReadingsState>(() =>
    cache.has(key) ? { data: cache.get(key) ?? null, loading: false } : { data: null, loading: true },
  );

  useEffect(() => {
    if (cache.has(key)) {
      setState({ data: cache.get(key) ?? null, loading: false });
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setState({ data: null, loading: false });
      return;
    }

    let live = true;
    setState({ data: null, loading: true });

    void (async () => {
      const { data } = await supabase
        .from("daily_readings")
        .select("readings, liturgic_title, translation, source, audio_url")
        .eq("on_date", dayKey)
        .eq("rite", rite)
        .maybeSingle<Pick<ReadingRow, "readings" | "liturgic_title" | "translation" | "source" | "audio_url">>();

      const value: DayReadings | null = data
        ? {
            readings: Array.isArray(data.readings) ? data.readings : [],
            sourceTitle: data.liturgic_title,
            translation: data.translation,
            source: data.source,
            audioUrl: data.audio_url,
          }
        : null;

      // Cached either way. A day the mirror has nothing for will still have
      // nothing on the next tap, and asking again for every one of them would
      // be a request per day scrolled past.
      cache.set(key, value);
      if (live) setState({ data: value, loading: false });
    })().catch(() => {
      // Offline, or the table does not exist yet because migration 0010 has
      // not been applied. Neither is worth a message: the day still has its
      // feasts, its season and its saints, which is the calendar's actual job.
      if (live) setState({ data: null, loading: false });
    });

    return () => {
      live = false;
    };
  }, [key, dayKey, rite]);

  return state;
}
