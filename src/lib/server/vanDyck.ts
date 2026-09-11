import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

/**
 * The Arabic Van Dyck Bible, for giving the Orthodox readings in Arabic.
 *
 * orthocal.info — the only source that is actually the Orthodox calendar — is
 * English only, and there is no Arabic Orthodox feed to mirror instead. But it
 * hands over every reading as a list of verses with their book, chapter and
 * verse, so the Arabic can be *looked up* rather than translated: the same
 * verses, in the Van Dyck text (Syrian Mission, 1865; public domain), which is
 * what the Antiochian Orthodox read in Arabic. Nobody here writes a word of it.
 *
 * The file is written by scripts/bible/build-van-dyck.mjs from eBible.org's
 * edition, renumbered in two places to the KJV versification orthocal uses —
 * see that script. It is read from disk rather than imported, so a 1.4 MB
 * Bible is not type-checked or bundled; next.config.ts traces it into the
 * cron function.
 *
 * Van Dyck is the Protestant canon. Wisdom, Baruch, the Song of the Three and
 * orthocal's "composite" Vespers readings — stitched from several chapters in
 * a translation of their own — have no Van Dyck text to find. Those readings
 * keep orthocal's English and say so, rather than being given an Arabic that
 * somebody here made up.
 */

type Bible = {
  books: Record<string, string>;
  /** verses[BOOK][chapter - 1][verse - 1] */
  verses: Record<string, string[][]>;
};

let bible: Bible | null = null;

function load(): Bible {
  if (!bible) {
    const file = join(process.cwd(), "src", "data", "bible", "arb-vd.json.gz");
    bible = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")) as Bible;
  }
  return bible;
}

/**
 * Book names Van Dyck does not have, for the label of a reading that falls back
 * to English. The reference is still a fact and still worth giving in Arabic;
 * only the text is missing.
 */
const OUTSIDE_VAN_DYCK: Record<string, string> = {
  WIS: "حكمة سليمان",
  BAR: "باروخ",
  S3Y: "نشيد الفتية الثلاثة",
  SIR: "يشوع بن سيراخ",
  TOB: "طوبيا",
  JDT: "يهوديت",
  "1MA": "المكابيين الأول",
  "2MA": "المكابيين الثاني",
};

export type Verse = { book?: string; chapter?: number; verse?: number };

const MASC = ["", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر", "الحادي عشر", "الثاني عشر"];
const FEM = ["", "الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة", "الحادية عشرة", "الثانية عشرة"];

const PART: Record<string, string> = {
  Prophecy: "النبوءة",
  Epistle: "الرسالة",
  Gospel: "الإنجيل",
};

const OFFICE: Record<string, string> = {
  Vespers: "صلاة الغروب",
  Matins: "صلاة السَّحَر",
  "Matins Epistle": "رسالة السَّحَر",
  "Matins Gospel": "إنجيل السَّحَر",
  Epistle: "الرسالة",
  Gospel: "الإنجيل",
  Prophecy: "النبوءة",
  "Great Blessing of Waters": "تقديس الماء الكبير",
};

/**
 * The service a reading belongs to, in Arabic — "4th Matins Gospel" is "إنجيل
 * السَّحَر الرابع". These are the names of offices, not scripture; anything not
 * recognised stays in orthocal's English rather than being guessed at.
 */
export function officeInArabic(source: string | undefined): string | null {
  if (!source) return null;
  const s = source.trim();
  if (OFFICE[s]) return OFFICE[s];

  const nth = s.match(/^(\d+)(?:st|nd|rd|th) (Matins Gospel|Passion Gospel|Hour)(?:, (\w+))?$/);
  if (nth) {
    const n = Number(nth[1]);
    if (nth[2] === "Matins Gospel" && MASC[n]) return `إنجيل السَّحَر ${MASC[n]}`;
    if (nth[2] === "Passion Gospel" && MASC[n]) return `إنجيل الآلام ${MASC[n]}`;
    if (nth[2] === "Hour" && FEM[n]) {
      const hour = `الساعة ${FEM[n]}`;
      if (!nth[3]) return hour;
      return PART[nth[3]] ? `${hour}، ${PART[nth[3]]}` : null;
    }
  }
  return null;
}

/**
 * "8: 22-23، 27-30" from the verses themselves, not from orthocal's display
 * string — the verses are what the Arabic text was assembled from, so the
 * reference printed above it cannot disagree with it.
 */
function reference(verses: { chapter: number; verse: number }[], chapterLength: (c: number) => number): string {
  type Run = { c1: number; v1: number; c2: number; v2: number };
  const runs: Run[] = [];
  for (const { chapter: c, verse: v } of verses) {
    const last = runs[runs.length - 1];
    const follows =
      last &&
      ((c === last.c2 && v === last.v2 + 1) ||
        (c === last.c2 + 1 && v === 1 && last.v2 === chapterLength(last.c2)));
    if (follows) {
      last.c2 = c;
      last.v2 = v;
    } else {
      runs.push({ c1: c, v1: v, c2: c, v2: v });
    }
  }

  let chapter = -1;
  return runs
    .map((r) => {
      const start = r.c1 === chapter ? `${r.v1}` : `${r.c1}: ${r.v1}`;
      chapter = r.c2;
      if (r.c1 === r.c2) return r.v1 === r.v2 ? start : `${start}-${r.v2}`;
      return `${start} - ${r.c2}: ${r.v2}`;
    })
    .join("، ");
}

export type ArabicReading = {
  label: string | null;
  ref: string | null;
  text: string | null;
  /** Set only when the text had to stay in English. */
  lang?: "en";
};

/**
 * One orthocal reading, in Arabic.
 *
 * All or nothing per reading: if a single verse is missing from Van Dyck the
 * whole reading keeps its English text. Half a passage in one language and half
 * in another is worse than either.
 */
export function arabicReading(r: {
  source?: string;
  display?: string;
  passage?: Verse[];
  english: string | null;
}): ArabicReading {
  const { books, verses } = load();
  const passage = (r.passage ?? []).filter(
    (v): v is Required<Verse> => Boolean(v.book) && typeof v.chapter === "number" && typeof v.verse === "number",
  );
  const office = officeInArabic(r.source);

  // One book per reading in every case seen; a reading that ever spans two is
  // referenced book by book in order.
  const byBook: { book: string; verses: { chapter: number; verse: number }[] }[] = [];
  for (const v of passage) {
    const last = byBook[byBook.length - 1];
    if (last?.book === v.book) last.verses.push(v);
    else byBook.push({ book: v.book, verses: [v] });
  }

  const complete =
    passage.length > 0 &&
    passage.length === (r.passage ?? []).length &&
    passage.every((v) => Boolean(verses[v.book]?.[v.chapter - 1]?.[v.verse - 1]));

  const named = byBook.every((b) => books[b.book] || OUTSIDE_VAN_DYCK[b.book]);
  const ref =
    passage.length && named && passage.length === (r.passage ?? []).length
      ? byBook
          .map(
            (b) =>
              `${books[b.book] ?? OUTSIDE_VAN_DYCK[b.book]} ${reference(
                b.verses,
                (c) => verses[b.book]?.[c - 1]?.length ?? 0,
              )}`,
          )
          .join("؛ ")
      : null;

  if (!complete) {
    return {
      label: office && (ref ?? r.display) ? `${office} · ${ref ?? r.display}` : (ref ?? r.display ?? office ?? null),
      ref: ref ?? r.display ?? null,
      text: r.english,
      lang: "en",
    };
  }

  return {
    label: office ? `${office} · ${ref}` : ref,
    ref,
    text: passage.map((v) => verses[v.book][v.chapter - 1][v.verse - 1]).join("\n"),
  };
}
