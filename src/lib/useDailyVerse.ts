"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The daily verse, for the top of the Today tab.
 *
 * It arrives one of two ways. Tapping the morning notification opens the app
 * on `/?verse=<ref>&topic=<id>`, and that exact verse is shown — the one the
 * notification carried, which may have had to cut it short. Opening the app any
 * other way asks the server which verse this device is due today, which is the
 * same verse the notification sends, so it is still there for somebody who
 * swiped the notification away.
 *
 * The answer is kept for the rest of the day, so it shows offline and does not
 * flicker in on every visit to the tab.
 */

export type DailyVerse = {
  ref: string;
  en: string;
  ar: string;
  ref_en: string;
  ref_ar: string;
  topic: { id: string; en: string; ar: string };
};

const KEY = "up_daily_verse_v1";

type Stored = { date: string; verse: DailyVerse };

/** The device's own date — the day the verse belongs to. */
const today = () => new Intl.DateTimeFormat("en-CA").format(new Date());

function readStored(): DailyVerse | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null") as Stored | null;
    return s && s.date === today() ? s.verse : null;
  } catch {
    return null;
  }
}

function store(verse: DailyVerse) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ date: today(), verse } satisfies Stored));
  } catch {
    /* private mode — it is fetched again next time */
  }
}

async function fetchVerse(body: Record<string, string>): Promise<DailyVerse | null> {
  const res = await fetch("/api/verses/today", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { verse?: DailyVerse | null };
  return data.verse ?? null;
}

export type DailyVerseState = {
  verse: DailyVerse | null;
  /** Opened from the notification: the Today tab should come forward on it. */
  arrived: boolean;
  /** Called once the arrival has been shown, so it plays once. */
  settle: () => void;
};

/**
 * @param endpoint this device's push endpoint, once known — null while push is
 *   off or still being checked, in which case only a tapped link can show a verse.
 */
export function useDailyVerse(endpoint: string | null): DailyVerseState {
  const [verse, setVerse] = useState<DailyVerse | null>(null);
  const [arrived, setArrived] = useState(false);
  const [linked, setLinked] = useState(false);

  // The notification's link, read once and taken out of the address bar so a
  // refresh or a saved bookmark does not replay the arrival.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("verse");
    const topic = params.get("topic");
    const cached = readStored();
    if (cached) setVerse(cached);

    if (!ref || !topic) return;
    setLinked(true);
    setArrived(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("verse");
    url.searchParams.delete("topic");
    window.history.replaceState(window.history.state, "", url);

    if (cached?.ref === ref && cached.topic.id === topic) return;
    fetchVerse({ ref, topic })
      .then((v) => {
        if (!v) return;
        store(v);
        setVerse(v);
      })
      .catch(() => {});
  }, []);

  // Otherwise, this device's verse for today — once there is a device to ask about.
  useEffect(() => {
    if (linked || !endpoint || readStored()) return;
    let live = true;
    fetchVerse({ endpoint })
      .then((v) => {
        if (!live || !v) return;
        store(v);
        setVerse(v);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [endpoint, linked]);

  // Stable, so the card's effect that depends on it runs once per arrival.
  const settle = useCallback(() => setArrived(false), []);
  return { verse, arrived, settle };
}
