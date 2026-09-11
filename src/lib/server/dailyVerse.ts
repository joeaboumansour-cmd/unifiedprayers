import "server-only";

import topicsDoc from "@/data/verses/topics.json";
import versesDoc from "@/data/verses/verses.json";

/**
 * The daily verse: which one a device gets, and how it reads as a notification.
 *
 * This replaced the morning streak message. Every word of it is scripture,
 * looked up by scripts/bible/build-verses.mjs in two public-domain Bibles —
 * the World English Bible and Van Dyck — against references picked by topic
 * in src/data/verses/topics.json. Nothing here writes or translates a verse;
 * it only chooses one and, where a phone would cut it off, shortens it with
 * an ellipsis.
 *
 * Both languages travel in every push, as they always have: the service worker
 * shows whichever the app is set to when it arrives.
 *
 * The choice is a pure function of the device, its topics and its own calendar
 * date, so the cron that sends the notification and the app that shows the
 * verse at the top of the Today tab agree without either storing what was sent.
 */

export type TopicId = string;

type Topic = { id: TopicId; group: string; en: string; ar: string; refs: string[] };

export type VerseText = { en: string; ar: string; ref_en: string; ref_ar: string };

export type DailyVerse = VerseText & {
  ref: string;
  topic: { id: TopicId; en: string; ar: string };
};

const TOPICS = (topicsDoc as { topics: Topic[] }).topics;
const VERSES = (versesDoc as { verses: Record<string, VerseText> }).verses;
const BY_ID = new Map(TOPICS.map((t) => [t.id, t]));
const ALL_IDS = TOPICS.map((t) => t.id);

export const isTopic = (id: unknown): id is TopicId => typeof id === "string" && BY_ID.has(id);

/** A topic list as stored: known ids only, deduplicated, in the file's order. */
export function cleanTopics(raw: unknown): TopicId[] | null {
  if (raw === null) return null;
  if (!Array.isArray(raw)) return null;
  const wanted = new Set(raw.filter(isTopic));
  return ALL_IDS.filter((id) => wanted.has(id));
}

/** FNV-1a: small, stable across runs and machines, which is all this needs. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 0..n-1 shuffled by a seed — the same seed always gives the same order. */
function permutation(n: number, seed: number): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  let s = seed || 1;
  for (let i = n - 1; i > 0; i--) {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const j = (s >>> 0) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Whole days since 1970 for a "YYYY-MM-DD" — the device's date, not UTC's. */
function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * Today's verse for one device.
 *
 * The topics take turns, one a day, so somebody who ticked Envy and Grief does
 * not get six days of one and then six of the other. Within a topic the verses
 * come in a shuffled order fixed per device, and every one of them is sent
 * before any repeats. The device id offsets both, so two people with the same
 * topics are not sent the same verse on the same morning.
 *
 * No topics — never chosen, or all unticked — means all of them.
 */
export function pickVerse(seed: string, topics: TopicId[] | null | undefined, date: string): DailyVerse {
  const chosen = topics?.length ? ALL_IDS.filter((id) => topics.includes(id)) : ALL_IDS;
  const pool = chosen.length ? chosen : ALL_IDS;
  const day = dayNumber(date) + (hash(seed) % 997);

  const topic = BY_ID.get(pool[mod(day, pool.length)])!;
  const round = Math.floor(day / pool.length);
  const order = permutation(topic.refs.length, hash(`${seed}:${topic.id}`));
  const ref = topic.refs[order[mod(round, topic.refs.length)]];

  return verseFor(ref, topic.id)!;
}

/** One verse by reference, under a topic — for the app, when a notification is tapped. */
export function verseFor(ref: string, topicId: string): DailyVerse | null {
  const topic = BY_ID.get(topicId);
  const text = VERSES[ref];
  if (!topic || !text || !topic.refs.includes(ref)) return null;
  return { ...text, ref, topic: { id: topic.id, en: topic.en, ar: topic.ar } };
}

/* ------------------------------------------------------------ notification */

/**
 * Past this a phone's notification cuts the text off itself, mid-word and
 * without saying so. Shortened here instead, at a word, with an ellipsis; the
 * whole verse is one tap away at the top of the Today tab.
 */
const MAX = 220;

/**
 * A verse lifted out of its chapter, marked as such.
 *
 * Many verses begin mid-sentence ("for where your treasure is…") or end on the
 * comma that led into the next one. On a page that is invisible; alone in a
 * notification it reads as a mistake. The convention for a quotation is the
 * ellipsis, so that is all this adds — the words themselves are untouched.
 */
export function excerpt(text: string, lang: "en" | "ar", max = MAX): string {
  let s = text.trim();
  // A trailing comma, semicolon, colon or dash leads into words not sent.
  const closing = s.match(/[”’"'»]+$/)?.[0] ?? "";
  const body = closing ? s.slice(0, -closing.length) : s;
  if (/[,;:—–\-،؛]\s*$/.test(body)) s = `${body.replace(/[,;:—–\-،؛]\s*$/, "")}…${closing}`;
  // Opening on a lowercase word means the sentence started in the verse before.
  if (lang === "en" && /^[“‘"']*[a-z]/.test(s)) s = `…${s}`;

  // Counted in letters a reader sees. Van Dyck is fully vowelled, and its
  // marks are characters of their own — counted, they would cut an Arabic
  // verse at half the length of the English one beside it.
  const end = cutAt(s, max - 1);
  if (end < s.length) {
    const cut = s.slice(0, end);
    const space = cut.lastIndexOf(" ");
    s = `${(space > end * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:—–\-،؛.]+$/, "")}…`;
  }
  return s;
}

/** Arabic vowel marks and the dagger alif: drawn on a letter, not beside it. */
const MARK = /[ً-ٰٟ]/;

/** Where `limit` visible letters end in `s`, or its length if it is shorter. */
function cutAt(s: string, limit: number): number {
  let seen = 0;
  for (let i = 0; i < s.length; i++) {
    if (MARK.test(s[i])) continue;
    if (seen === limit) return i;
    seen++;
  }
  return s.length;
}

/** The push payload's words: the topic as the title, the verse and its reference below. */
export function notificationFor(v: DailyVerse) {
  return {
    title_en: `Today's verse · ${v.topic.en}`,
    title_ar: `آية اليوم · ${v.topic.ar}`,
    body_en: `${excerpt(v.en, "en")} — ${v.ref_en}`,
    body_ar: `${excerpt(v.ar, "ar")} — ${v.ref_ar}`,
  };
}

/** Where tapping the notification lands: the Today tab, on this verse. */
export const verseUrl = (v: DailyVerse) =>
  `/?verse=${encodeURIComponent(v.ref)}&topic=${encodeURIComponent(v.topic.id)}`;
