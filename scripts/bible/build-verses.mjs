/**
 * Generates src/data/verses/verses.json — the text of every verse the daily
 * verse notification can send, in English and Arabic.
 *
 * Run it with `npm run bible:verses` after changing src/data/verses/topics.json.
 *
 * The split is the point. topics.json is the one place a human decision lives:
 * which references belong under "Envy" or "Grief". A reference is a fact and
 * choosing them is curation. The *words* are never written here — they are
 * looked up, verse for verse, in two public-domain Bibles:
 *
 *   English  World English Bible, the edition that reads "the LORD"
 *            (eBible.org `engwebp`). Modern, and public domain.
 *   Arabic   Van Dyck, from the copy the readings mirror already bundles
 *            (src/data/bible/arb-vd.json.gz — see build-van-dyck.mjs).
 *
 * Both are numbered the way the KJV numbers verses, so one reference names the
 * same words in both. The only places they disagree are Romans 14/16, where
 * the WEB moves the closing doxology, and the two last-verse splits Van Dyck's
 * copy was already renumbered for; the check below refuses a reference that
 * lands on any of them rather than pairing mismatched verses.
 *
 * The run ends with a report — every verse's English, flagged where it is
 * long for a notification — because a mistyped verse number does not fail, it
 * quietly sends an unrelated verse under the wrong heading. Read it.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { fetchEdition } from "./ebible.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const TOPICS = join(root, "src", "data", "verses", "topics.json");
const OUT = join(root, "src", "data", "verses", "verses.json");
const VAN_DYCK = join(root, "src", "data", "bible", "arb-vd.json.gz");

/** Longer than this and a phone's notification cuts it off before the end. */
const LONG = 240;

/** Where the two Bibles number differently; see above. */
const UNSAFE = [/^ROM 14:2[3-6]/, /^ROM 16:2[5-7]/];

/**
 * A psalm's title is part of its first verse in both Bibles — "A Psalm by
 * David. The LORD is my shepherd". Fine on a page, wrong as the first words of
 * a notification, and not something to trim off scripture here. Pick another.
 */
const TITLE = /^(For the Chief Musician|A Psalm|A Song|A Prayer|A contemplation|By David|By Solomon|Of David|Michtam|Maskil|A Maskil)/i;

/**
 * Where a verse on its own is half a sentence: it opens on a lowercase word or
 * a conjunction, or stops on a comma. Reported rather than refused — "but" can
 * open a verse that stands perfectly well — but every one wants a look.
 */
const FRAGMENT = (en) =>
  /^[a-z]/.test(en.replace(/^[“‘"']+/, "")) || /[,;:—-]\s*[”’"']*$/.test(en);

const EN_BOOKS = {
  GEN: "Genesis", EXO: "Exodus", LEV: "Leviticus", NUM: "Numbers", DEU: "Deuteronomy",
  JOS: "Joshua", JDG: "Judges", RUT: "Ruth", "1SA": "1 Samuel", "2SA": "2 Samuel",
  "1KI": "1 Kings", "2KI": "2 Kings", "1CH": "1 Chronicles", "2CH": "2 Chronicles",
  EZR: "Ezra", NEH: "Nehemiah", EST: "Esther", JOB: "Job", PSA: "Psalm", PRO: "Proverbs",
  ECC: "Ecclesiastes", SNG: "Song of Songs", ISA: "Isaiah", JER: "Jeremiah",
  LAM: "Lamentations", EZK: "Ezekiel", DAN: "Daniel", HOS: "Hosea", JOL: "Joel",
  AMO: "Amos", OBA: "Obadiah", JON: "Jonah", MIC: "Micah", NAM: "Nahum", HAB: "Habakkuk",
  ZEP: "Zephaniah", HAG: "Haggai", ZEC: "Zechariah", MAL: "Malachi", MAT: "Matthew",
  MRK: "Mark", LUK: "Luke", JHN: "John", ACT: "Acts", ROM: "Romans", "1CO": "1 Corinthians",
  "2CO": "2 Corinthians", GAL: "Galatians", EPH: "Ephesians", PHP: "Philippians",
  COL: "Colossians", "1TH": "1 Thessalonians", "2TH": "2 Thessalonians", "1TI": "1 Timothy",
  "2TI": "2 Timothy", TIT: "Titus", PHM: "Philemon", HEB: "Hebrews", JAS: "James",
  "1PE": "1 Peter", "2PE": "2 Peter", "1JN": "1 John", "2JN": "2 John", "3JN": "3 John",
  JUD: "Jude", REV: "Revelation",
};

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const arNum = (s) => String(s).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);

function parse(ref) {
  const m = ref.match(/^([0-9A-Z]{3}) (\d+):(\d+)(?:-(\d+))?$/);
  if (!m) throw new Error(`cannot read reference "${ref}"`);
  const [, book, c, v1, v2] = m;
  return { book, chapter: Number(c), from: Number(v1), to: Number(v2 ?? v1) };
}

function lookup(verses, { book, chapter, from, to }) {
  const out = [];
  for (let v = from; v <= to; v++) {
    const text = verses[book]?.[chapter - 1]?.[v - 1];
    if (!text) return null;
    out.push(text);
  }
  return out.join(" ");
}

async function main() {
  const { topics } = JSON.parse(readFileSync(TOPICS, "utf8"));
  const vd = JSON.parse(gunzipSync(readFileSync(VAN_DYCK)).toString("utf8"));
  const web = await fetchEdition("engwebp");

  const verses = {};
  const problems = [];
  const report = [];

  for (const topic of topics) {
    report.push(`\n## ${topic.en} (${topic.refs.length})`);
    for (const ref of topic.refs) {
      if (UNSAFE.some((r) => r.test(ref))) {
        problems.push(`${topic.id}: ${ref} is numbered differently in the two Bibles`);
        continue;
      }
      const p = parse(ref);
      const en = lookup(web.verses, p);
      const ar = lookup(vd.verses, p);
      if (!en || !ar) {
        problems.push(`${topic.id}: ${ref} not found (${!en ? "English" : ""}${!en && !ar ? ", " : ""}${!ar ? "Arabic" : ""})`);
        continue;
      }
      if (TITLE.test(en)) {
        problems.push(`${topic.id}: ${ref} opens with the psalm's title — "${en.slice(0, 50)}…"`);
        continue;
      }
      const range = p.from === p.to ? `${p.from}` : `${p.from}-${p.to}`;
      verses[ref] = {
        en,
        ar,
        ref_en: `${EN_BOOKS[p.book]} ${p.chapter}:${range}`,
        ref_ar: `${vd.books[p.book]} ${arNum(p.chapter)}: ${arNum(range)}`,
      };
      const flag =
        (en.length > LONG ? `  [LONG ${en.length}]` : "") + (FRAGMENT(en) ? "  [FRAGMENT]" : "");
      report.push(`- ${ref}${flag}: ${en}`);
    }
  }

  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }

  const doc = {
    editions: {
      en: { title: "World English Bible", licence: "Public Domain", source: "eBible.org", url: web.url },
      ar: { title: "الكتاب المقدس، ترجمة فان دايك", licence: "Public Domain", source: "eBible.org" },
    },
    verses,
  };
  writeFileSync(OUT, JSON.stringify(doc, null, 0) + "\n");

  const report_path = process.env.VERSES_REPORT;
  if (report_path) writeFileSync(report_path, report.join("\n") + "\n");
  else console.log(report.join("\n"));
  const count = Object.keys(verses).length;
  console.log(`\n${count} verses across ${topics.length} topics → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
