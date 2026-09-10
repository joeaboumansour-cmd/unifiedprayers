/**
 * Generates src/data/liturgy/martyrology.json — the long tail of saints.
 *
 * Run it with `npm run liturgy:martyrology`.
 *
 * This is not the liturgical calendar and must never be confused with it. The
 * tables the other two scripts build are what a church actually celebrates:
 * ranked, coloured, and answerable to a bishop. This one is the wider memory —
 * the several thousand saints who are remembered on a given day somewhere in
 * the Christian world, most of whom no parish will mention. The app shows them
 * under their own heading, below the day's real feasts, for the reader who
 * wants to know who else this day belongs to.
 *
 * Everything comes from Wikidata's feast-day property, with three filters that
 * between them keep the file honest:
 *
 *   a resolvable day    P841 often points at a month, or at a movable feast.
 *                       Only entries that resolve to a real day of the year
 *                       are kept.
 *   an article          if there is nothing to read, the name is a dead end.
 *                       The whole point of this list is that each name opens.
 *   a person or a saint  either canonized, or an instance of a human. Without
 *                       this the list fills with churches and paintings named
 *                       after saints, which share the feast day by dedication.
 *
 * A saint can be kept on different days by different churches, and Wikidata
 * records several. All of them are kept: a reader looking up 9 September should
 * find Joachim and Anne there, whichever calendar put them there.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getJSON } from "./wiki.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "..", "src", "data", "liturgy", "martyrology.json");
const SPARQL = "https://query.wikidata.org/sparql";

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** "9 September" or "September 9" -> "09-09". Anything else -> null. */
function monthDay(label) {
  const t = label.trim();
  const m = t.match(/^([A-Za-z]+)\s+(\d{1,2})$/) ?? t.match(/^(\d{1,2})\s+([A-Za-z]+)$/);
  if (!m) return null;
  const [a, b] = [m[1], m[2]];
  const mon = MONTHS[a.toLowerCase()] ?? MONTHS[b.toLowerCase()];
  const day = Number(MONTHS[a.toLowerCase()] ? b : a);
  if (!mon || !Number.isInteger(day) || day < 1 || day > 31) return null;
  return `${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * One month at a time. The whole set in a single query is tens of thousands of
 * rows across five optional joins, which the public endpoint times out on.
 */
async function fetchMonth(monthName) {
  const query = `
SELECT ?s ?sLabel ?arLabel ?feastLabel ?en ?ar ?died ?desc WHERE {
  ?s wdt:P841 ?feast .
  ?feast rdfs:label ?feastLabel .
  FILTER(LANG(?feastLabel) = "en")
  FILTER(STRSTARTS(?feastLabel, "${monthName}"))
  { ?s wdt:P411 ?canon } UNION { ?s wdt:P31 wd:Q5 }
  ?en schema:about ?s ; schema:isPartOf <https://en.wikipedia.org/> .
  OPTIONAL { ?ar schema:about ?s ; schema:isPartOf <https://ar.wikipedia.org/> . }
  OPTIONAL { ?s rdfs:label ?sLabel  . FILTER(LANG(?sLabel) = "en") }
  OPTIONAL { ?s rdfs:label ?arLabel . FILTER(LANG(?arLabel) = "ar") }
  OPTIONAL { ?s wdt:P570 ?died }
  OPTIONAL { ?s schema:description ?desc . FILTER(LANG(?desc) = "en") }
}`;
  const j = await getJSON(`${SPARQL}?format=json&query=${encodeURIComponent(query)}`);
  return j.results.bindings;
}

const byDay = {};
const seen = new Set();
let rows = 0;

for (const name of Object.keys(MONTHS)) {
  const label = name[0].toUpperCase() + name.slice(1);
  const bindings = await fetchMonth(label);
  rows += bindings.length;

  for (const b of bindings) {
    const day = monthDay(b.feastLabel.value);
    if (!day) continue;
    const qid = b.s.value.split("/").pop();

    // The same saint can come back once per language label combination.
    const key = `${day}|${qid}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const title = decodeURIComponent(b.en.value.split("/wiki/")[1]).replace(/_/g, " ");
    const entry = { n: b.sLabel?.value ?? title, w: title };
    if (b.arLabel) entry.a = b.arLabel.value;
    if (b.ar) entry.aw = decodeURIComponent(b.ar.value.split("/wiki/")[1]).replace(/_/g, " ");
    // The year of death, which for most saints is also the feast's own reason.
    const y = b.died?.value?.match(/^(-?\d{1,4})-/)?.[1];
    if (y) entry.d = Number(y);
    (byDay[day] ??= []).push(entry);
  }
  console.log(`  ${label.padEnd(10)} ${bindings.length} rows`);
}

// Alphabetical inside a day, so the order is stable across rebuilds and does
// not imply a ranking the source cannot support.
for (const day of Object.keys(byDay)) byDay[day].sort((a, b) => a.n.localeCompare(b.n));

const ordered = Object.fromEntries(Object.keys(byDay).sort().map((k) => [k, byDay[k]]));
writeFileSync(
  out,
  JSON.stringify(
    {
      version: 1,
      _readme: [
        "GENERATED by scripts/liturgy/build-martyrology.mjs — do not edit by hand.",
        "The wider memory of the church, not any one church's calendar: saints",
        "remembered on a day somewhere in the Christian world. Keyed MM-DD.",
        "n = name, a = Arabic name, w = English article, aw = Arabic article,",
        "d = year of death. Every entry has an article; that is the point.",
      ],
      days: ordered,
    },
    null,
    0,
  ) + "\n",
);

const total = Object.values(ordered).reduce((n, v) => n + v.length, 0);
const days = Object.keys(ordered).length;
const withAr = Object.values(ordered).flat().filter((e) => e.aw).length;
console.log(`\nwrote src/data/liturgy/martyrology.json`);
console.log(`  ${total} saints across ${days} days of the year`);
console.log(`  ${withAr} with an Arabic article`);
console.log(`  ${rows} rows fetched, ${rows - total} dropped (no resolvable day, or duplicates)`);
const empty = [];
for (let m = 1; m <= 12; m++)
  for (let d = 1; d <= 31; d++) {
    const k = `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if ((m === 2 && d > 29) || ([4, 6, 9, 11].includes(m) && d > 30)) continue;
    if (!ordered[k]) empty.push(k);
  }
if (empty.length) console.log(`  ${empty.length} days with nobody: ${empty.join(", ")}`);
