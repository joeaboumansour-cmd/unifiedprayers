/**
 * Generates src/data/bible/arb-vd.json.gz — the Arabic Van Dyck Bible, as the
 * readings mirror uses it to give the Orthodox calendar its readings in Arabic.
 *
 * Run it with `npm run bible:van-dyck`. Nothing in the app imports this script;
 * the cron route reads only the file it writes.
 *
 * Why a Bible at all, when every other reading comes from a feed: orthocal.info
 * is the only source that is actually the Orthodox calendar, and it is English
 * only. There is no Arabic Orthodox feed to mirror instead. What orthocal does
 * give is every verse of every reading as book, chapter and verse — so the
 * Arabic is not translated by anybody here, it is *looked up*, verse for verse,
 * in the Van Dyck translation (Syrian Mission, 1865), which is the Bible the
 * Antiochian Orthodox have read in Arabic for a century and a half and which is
 * public domain.
 *
 * The text comes from eBible.org, unedited: fully vocalised, as printed. The
 * book names come from the same edition's own table of contents.
 *
 * ONE ADJUSTMENT, and it is to numbering, never to words. orthocal's passages
 * are numbered as the King James numbers them, and Van Dyck agrees with the KJV
 * on every chapter and verse count but two, where it splits the last verse of a
 * chapter in two — 1 Timothy 6:21 and 3 John 1:14. Those two halves are joined
 * back under the KJV number so that "1 Tim 6:21" asks for, and gets, the same
 * words in both languages. The check below fails loudly if a new edition from
 * eBible stops splitting them, rather than quietly doubling a verse.
 *
 * Van Dyck is the Protestant canon: Wisdom, Baruch and the other books the
 * Orthodox read at Vespers are not in it. The cron route knows that and keeps
 * orthocal's English for those readings rather than inventing an Arabic.
 */

import { gzipSync, inflateRawSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "..", "src", "data", "bible", "arb-vd.json.gz");

const ZIP = "https://ebible.org/Scriptures/arb-vd_vpl.zip";
const INDEX = "https://ebible.org/arb-vd/index.htm";

/** Van Dyck splits these; the KJV (and so orthocal) does not. */
const JOIN_TO_KJV = [
  { book: "1TI", chapter: 6, from: 22, into: 21 },
  { book: "3JN", chapter: 1, from: 15, into: 14 },
];

/** One named entry out of a zip, without a dependency for it. */
function unzipEntry(buf, name) {
  // The end-of-central-directory record sits in the last 64 KiB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const entry = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (entry === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      throw new Error(`unsupported zip method ${method}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${name} not in the archive`);
}

/** Harakat off a *name* for a label. The verses themselves keep every mark. */
const bare = (s) => s.replace(/[ً-ٰٟ]/g, "").replace(/ٱ/g, "ا");
/** "١ كورنثوس" → "1 كورنثوس", to sit beside the Western digits of a reference. */
const westernDigits = (s) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

async function main() {
  const zip = Buffer.from(await (await fetch(ZIP)).arrayBuffer());
  const xml = unzipEntry(zip, "arb-vd_vpl.xml").toString("utf8");
  const index = await (await fetch(INDEX)).text();

  const books = {};
  for (const m of index.matchAll(/href='([0-9A-Z]{3})\d+\.htm'>([^<]+)</g)) {
    books[m[1]] = westernDigits(bare(m[2].trim()));
  }

  /** verses[BOOK][chapter - 1][verse - 1] */
  const verses = {};
  let total = 0;
  for (const m of xml.matchAll(/<v b="([0-9A-Z]{3})" c="(\d+)" v="(\d+)">([^<]*)<\/v>/g)) {
    const [, b, c, v, text] = m;
    const chapters = (verses[b] ??= []);
    const chapter = (chapters[Number(c) - 1] ??= []);
    chapter[Number(v) - 1] = text.trim();
    total++;
  }

  for (const { book, chapter, from, into } of JOIN_TO_KJV) {
    const ch = verses[book]?.[chapter - 1];
    if (!ch || ch.length !== from || !ch[from - 1] || !ch[into - 1]) {
      throw new Error(`${book} ${chapter}:${from} is no longer split the way this script expects — check the edition`);
    }
    ch[into - 1] = `${ch[into - 1]} ${ch[from - 1]}`;
    ch.length = from - 1;
  }

  const missingNames = Object.keys(verses).filter((b) => !books[b]);
  if (missingNames.length) throw new Error(`no Arabic name for ${missingNames.join(", ")}`);
  if (Object.keys(verses).length !== 66) throw new Error(`expected 66 books, found ${Object.keys(verses).length}`);

  const doc = {
    edition: "arb-vd",
    title: "الكتاب المقدس باللغة العربية، فان دايك",
    licence: "Public Domain",
    source: "eBible.org",
    url: ZIP,
    versification: "KJV",
    fetched: new Date().toISOString().slice(0, 10),
    books,
    verses,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  const gz = gzipSync(Buffer.from(JSON.stringify(doc)), { level: 9 });
  writeFileSync(OUT, gz);
  console.log(`${total} verses, ${Object.keys(books).length} books → ${OUT} (${(gz.length / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
