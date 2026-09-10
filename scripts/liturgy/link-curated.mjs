/**
 * Fills in the reference links on the hand-written calendar table.
 *
 * Run it with `npm run liturgy:curated`. It edits src/data/liturgy.json in
 * place, setting `wiki` and `wikiAr` on every row it can resolve and leaving
 * everything a human wrote — the Arabic name, the note, the rite tags — exactly
 * as it found it.
 *
 * That file is the one somebody edits by hand, so this script has to be safe to
 * re-run over their edits. It never removes a `wikiTitle` hint and never
 * overwrites one: a hint is a human saying "this article, not whatever you
 * would have guessed", which is the same job wiki-overrides.json does for the
 * generated Roman table.
 *
 * The Maronite rows are the reason this exists. No library ships the Maronite
 * calendar, so those rows are all hand-written — and Mar Charbel, Mar Maroun,
 * St Rafqa and the rest deserve the same way through to their own story that
 * the Latin saints get for free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveTitles, describe, trustworthy } from "./wiki.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, "..", "..", "src", "data", "liturgy.json");

const data = JSON.parse(readFileSync(file, "utf8"));

/**
 * "St Charbel Makhlouf" -> "Charbel Makhlouf".
 *
 * Only ever a fallback. Anything whose English name is a description rather
 * than a person — "The Fast of the Mother of God begins" — will simply fail to
 * resolve, which is the right outcome: there is no article to point at.
 */
const guess = (en) =>
  en
    .split("·")[0]
    .split(",")[0]
    .replace(/^The\s+/i, "")
    .replace(/^(Sts?|Saints?|Blessed|Bl\.)\s+/i, "")
    .trim();

const wanted = new Map();
for (const f of data.feasts) {
  /*
   * Three states, not two:
   *
   *   a string   this article, because somebody looked it up
   *   null       no article, because the obvious one is wrong. The Maronite
   *              Ash Monday resolves cleanly to Clean Monday, which is a
   *              different church's fast beginning on a different day — a
   *              plausible link is the kind that gets read and believed, so
   *              this has to be sayable.
   *   absent     guess from the English name, then verify
   */
  if (f.wikiTitle === null) continue;
  wanted.set(f.id, f.wikiTitle ? [f.wikiTitle] : [guess(f.en)]);
}

console.log(`resolving ${data.feasts.length} curated rows…`);
const resolved = await resolveTitles([...new Set([...wanted.values()].flat())]);

const hits = new Map();
for (const f of data.feasts) {
  for (const t of wanted.get(f.id) ?? []) {
    const hit = resolved[t];
    if (hit?.qid && !hit.disambig) {
      hits.set(f.id, hit);
      break;
    }
  }
}

console.log("verifying what those links point at…");
const info = await describe([...new Set([...hits.values()].map((h) => h.qid))]);

let linked = 0;
let arabic = 0;
const rejected = [];
const missing = [];

for (const f of data.feasts) {
  if (f.wikiTitle === null) {
    // Deliberately linkless. Not a gap, so not reported as one.
    delete f.wiki;
    delete f.wikiAr;
    continue;
  }
  const hit = hits.get(f.id);
  if (!hit) {
    // Leave any link already there: a re-run offline should not strip the file.
    if (!f.wiki) missing.push(`${f.on ?? "E" + f.easter}  ${f.id}`);
    continue;
  }
  if (!trustworthy(info[hit.qid])) {
    rejected.push(`${f.on ?? "E" + f.easter}  ${f.id}  ->  ${hit.title} (${hit.qid}) :: ${info[hit.qid]?.desc ?? "?"}`);
    delete f.wiki;
    delete f.wikiAr;
    continue;
  }
  f.wiki = hit.title;
  if (hit.ar) f.wikiAr = hit.ar;
  else delete f.wikiAr;
  linked++;
  if (hit.ar) arabic++;
}

writeFileSync(file, JSON.stringify(data, null, 2) + "\n");

console.log(`\nwrote src/data/liturgy.json`);
console.log(`  ${linked} of ${data.feasts.length} rows linked`);
console.log(`  ${arabic} with an Arabic article`);

if (rejected.length) {
  console.log(`\n${rejected.length} rejected by verification — add a "wikiTitle" to the row:`);
  for (const r of rejected) console.log("  " + r);
}
if (missing.length) {
  console.log(`\n${missing.length} with no link (many of these have no article to point at):`);
  for (const m of missing) console.log("  " + m);
}
