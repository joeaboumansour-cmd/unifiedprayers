/**
 * Generates the General Roman Calendar shipped in src/data/liturgy/roman.json.
 *
 * Run it with `npm run liturgy:roman`. It is a build-time script and nothing in
 * the app imports it — the app reads only the JSON it writes, which is why a
 * phone in flight mode still knows every feast of every year.
 *
 * Two sources, and the split between them is the point:
 *
 *   dates, ranks, colours   romcal's `@romcal/calendar.general-roman` bundle,
 *                           which is the Roman calendar as promulgated. This is
 *                           the part that has to be *right*, and it is the part
 *                           nobody should be retyping by hand.
 *
 *   reference links         English Wikipedia, resolved through the API so
 *                           redirects are followed and the Arabic article comes
 *                           back with it. A saint the reader can read about is
 *                           the difference between a name and a person.
 *
 * The link half is guessed and therefore checked. A title is derived from
 * romcal's id — `nicholas_of_myra_bishop` gives "Nicholas of Myra", which is
 * disambiguated in a way the display name ("Saint Nicholas, Bishop") is not —
 * and every guess is then verified against Wikidata: anything that lands on a
 * disambiguation page, a given-name item, or a subject whose description does
 * not read as Christian is rejected rather than shipped. What is left over is
 * listed in wiki-overrides.json by hand. That file is the only place a human
 * judgement lives, and the script prints anything new that needs one.
 *
 * Arabic names come from the Arabic Wikipedia article title where there is one.
 * Where there is not, the entry falls back to the English and is listed at the
 * end of the run, so the gap is visible rather than silent.
 */

import { createRequire } from "node:module";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const UA = "UnifiedPrayers/1.0 (liturgical calendar build; joeaboumansour@gmail.com)";
const WIKI = "https://en.wikipedia.org/w/api.php";
const SPARQL = "https://query.wikidata.org/sparql";

/* --------------------------------- romcal -------------------------------- */

/*
 * romcal is NOT a dependency of this project, on purpose.
 *
 * Nothing the app ships imports it — the app reads src/data/liturgy/roman.json,
 * which this script writes and which is committed. Keeping romcal in
 * devDependencies made every deploy install it, and `romcal@3.0.0` and
 * `@romcal/calendar.general-roman@3.0.0-alpha.0` disagree about their peer
 * range, so a plain `npm install` fails outright. The local install only ever
 * worked because it was made with --legacy-peer-deps.
 *
 * Regenerating the Roman calendar is a rare and deliberate act, so the two
 * packages are installed for it and not kept: `npm run liturgy:deps`.
 */
let bundle;
try {
  bundle = require("@romcal/calendar.general-roman");
} catch {
  console.error(
    "\nromcal is not installed — it is not a dependency of this project.\n" +
      "Install it just for this run:\n\n  npm run liturgy:deps\n\n" +
      "and then run this again. Nothing the app ships needs it; only this\n" +
      "generator does, and its output is committed.\n",
  );
  process.exit(1);
}
const EN = bundle.GeneralRoman_En;
const LA = bundle.GeneralRoman_La;

/** romcal's precedence ladder, collapsed onto the four ranks the app draws. */
const RANK = {
  PROPER_OF_TIME_SOLEMNITY_2: "solemnity",
  GENERAL_SOLEMNITY_3: "solemnity",
  PROPER_SOLEMNITY__DEDICATION_OF_THE_OWN_CHURCH_4B: "solemnity",
  GENERAL_LORD_FEAST_5: "feast",
  GENERAL_FEAST_7: "feast",
  GENERAL_MEMORIAL_10: "memorial",
  OPTIONAL_MEMORIAL_12: "commemoration",
};

const COLOUR = {
  RED: "red", WHITE: "white", GREEN: "green",
  PURPLE: "violet", ROSE: "rose", GOLD: "white", BLACK: "violet",
};

/**
 * romcal expresses these as functions because their date is computed from the
 * year. Every one of them computes to the same day every year, so here they are
 * that day — which keeps the app's table to three date forms instead of four.
 */
const FIXED_FN = {
  allSaints: "11-01", annunciation: "03-25", assumption: "08-15",
  exaltationOfTheHolyCross: "09-14", immaculateConceptionOfMary: "12-08",
  nativityOfJohnTheBaptist: "06-24", peterAndPaulApostles: "06-29",
  presentationOfTheLord: "02-02", transfiguration: "08-06",
};

/** The two that really do move, as an offset from Easter. */
const EASTER_FN = { pentecostSunday: 49, immaculateHeartOfMary: 68 };

/** Red is the blood of martyrs and the fire of the Spirit; both wear it. */
const RED_TITLE = new Set(["MARTYR", "APOSTLE", "EVANGELIST"]);

function fromRomcal() {
  const rows = [];
  for (const [id, defs] of Object.entries(EN.inputs)) {
    const def = defs[0];
    const dd = def.dateDef ?? {};
    const row = { id, en: EN.i18n.names?.[id] ?? id };

    const la = LA.i18n.names?.[id];
    if (la) row.la = la;

    if (dd.month && dd.date) {
      row.on = `${String(dd.month).padStart(2, "0")}-${String(dd.date).padStart(2, "0")}`;
    } else if (FIXED_FN[dd.dateFn]) {
      row.on = FIXED_FN[dd.dateFn];
    } else if (EASTER_FN[dd.dateFn] !== undefined) {
      row.easter = EASTER_FN[dd.dateFn];
    } else if (dd.lastDayOfWeekInMonth !== undefined) {
      // "The last Sunday of October", kept by dioceses that do not know their
      // own dedication date. Not a day of the general calendar; dropped rather
      // than shown to everybody as though it were.
      continue;
    } else {
      console.warn(`  ! no date for ${id}: ${JSON.stringify(dd)}`);
      continue;
    }

    row.rank = RANK[def.precedence];
    if (!row.rank) throw new Error(`unmapped precedence ${def.precedence} on ${id}`);

    // A celebration can gather several saints; the colour is decided by all of
    // them together, which is why this walks the list rather than the id.
    const saints = def.martyrology ?? [id];
    const titles = new Set();
    let died = null;
    for (const s of saints) {
      const m = EN.martyrology[s];
      if (!m) continue;
      for (const t of m.titles ?? []) titles.add(t);
      if (died === null && m.dateOfDeath !== undefined) died = m.dateOfDeath;
    }

    const explicit = COLOUR[Array.isArray(def.colors) ? def.colors[0] : def.colors];
    row.colour = explicit ?? ([...titles].some((t) => RED_TITLE.has(t)) ? "red" : "white");
    if (died !== null) row.died = died;
    if (def.isHolyDayOfObligation) row.holyDay = true;
    rows.push(row);
  }
  rows.sort((a, b) => (a.on ?? "zz").localeCompare(b.on ?? "zz"));
  return rows;
}

/* ------------------------------ wikipedia -------------------------------- */

/** Role words that trail a romcal id and are not part of anybody's name. */
const ROLE = new Set([
  "virgin", "virgins", "bishop", "bishops", "priest", "priests", "martyr",
  "martyrs", "abbot", "abbess", "pope", "religious", "doctor", "deacon",
  "apostle", "apostles", "evangelist", "king", "queen", "hermit", "monk",
  "nun", "widow", "confessor", "archbishop", "companions", "and", "died",
  "pilgrim", "founder", "missionary", "matron", "protomartyr",
]);

/** Words an English title leaves in lower case once they are not first. */
const LOWER = new Set(["of", "the", "and", "de", "di", "da", "von", "van", "le", "la", "du"]);

const titleCase = (tokens) =>
  tokens
    .map((t, i) => (i > 0 && LOWER.has(t) ? t : t.charAt(0).toUpperCase() + t.slice(1)))
    .join(" ");

/**
 * "nicholas_of_myra_bishop" -> "Nicholas of Myra".
 *
 * The id is used in preference to the display name because it is already
 * disambiguated: the name on the calendar is "Saint Nicholas, Bishop", which
 * resolves to a Wikipedia page about the given name.
 */
function titleFromId(id) {
  const t = id.split("_");
  while (t.length > 1 && (ROLE.has(t.at(-1)) || LOWER.has(t.at(-1)))) t.pop();
  return t.length ? titleCase(t) : null;
}

const titleFromName = (en) =>
  en.split(",")[0].replace(/^(Saints?|Blessed)\s+/i, "").trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      // Wikimedia answers a rate limit in plain text, not JSON. Back off.
      if (i === tries - 1) throw new Error(`bad response: ${text.slice(0, 120)}`);
      await sleep(3000 * (i + 1));
    }
  }
}

/** Resolves article titles in batches, following redirects. */
async function resolveTitles(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 45) {
    const batch = titles.slice(i, i + 45);
    const url =
      `${WIKI}?action=query&format=json&redirects=1&prop=pageprops|langlinks` +
      `&lllang=ar&lllimit=500&titles=${encodeURIComponent(batch.join("|"))}`;
    const j = await getJSON(url);
    // Both maps are many-to-one: several titles can normalise or redirect onto
    // the same page. Kept as lists, because the answer has to be filed under
    // every name it was asked for under — see the loop below.
    const aliases = {};
    const alias = (to, from) => ((aliases[to] ??= []).push(from));
    for (const x of j.query.normalized ?? []) alias(x.to, x.from);
    for (const x of j.query.redirects ?? []) alias(x.to, x.from);

    for (const p of Object.values(j.query.pages)) {
      const value =
        p.missing !== undefined
          ? null
          : {
              title: p.title,
              qid: p.pageprops?.wikibase_item ?? null,
              ar: p.langlinks?.[0]?.["*"] ?? null,
              disambig: Boolean(p.pageprops?.disambiguation),
            };

      /*
       * File it under the page's own title *and* under every title that led
       * here, walking the chain back (a normalisation can feed a redirect).
       *
       * Both, not just the source: "Joseph the Worker" redirects to "Saint
       * Joseph", and this build asks for both — one as a guess, one as an
       * override. Storing only the redirect's source would leave the title
       * that was asked for directly with no answer at all, and the Solemnity
       * of Saint Joseph would ship with no link while the memorial had one.
       */
      const seen = new Set();
      const stack = [p.title];
      while (stack.length) {
        const key = stack.pop();
        if (seen.has(key)) continue;
        seen.add(key);
        out[key] = value;
        for (const from of aliases[key] ?? []) stack.push(from);
      }
    }
    await sleep(800);
  }
  return out;
}

/* ------------------------------ verification ----------------------------- */

/** A description that reads as Christian. Anything else is a mis-hit. */
const CHRISTIAN =
  /saint|martyr|pope|bishop|priest|nun|monk|abbot|abbess|virgin|christian|catholic|apostle|evangelist|theolog|mystic|missionary|hermit|friar|jesuit|franciscan|dominican|carmelite|feast|liturg|church|deacon|archbishop|patriarch|cardinal|blessed|religious|holy|mary|jesus|angel|prophet|disciple|confessor|doctor|basilica|cross|nativity|annunciation|bibl|devotion|veneration/i;

const DISAMBIG = "Q4167410";
/** "male given name", "female given name", "unisex given name", "family name". */
const NAME_ITEM = new Set(["Q101352", "Q12308941", "Q11879590", "Q3409032"]);

/**
 * Asks Wikidata what each matched entity actually is.
 *
 * Without this the build silently ships "Saint Titus" pointing at a gorilla in
 * Rwanda and "Saint Andrew" at an article about the name Andrew. A guessed link
 * that is never checked is worse than no link: the reader has no way to know.
 */
async function describe(qids) {
  const info = {};
  for (let i = 0; i < qids.length; i += 200) {
    const batch = qids.slice(i, i + 200);
    const query = `SELECT ?s ?desc ?canon ?feast ?type WHERE {
  VALUES ?s { ${batch.map((q) => "wd:" + q).join(" ")} }
  OPTIONAL { ?s schema:description ?desc . FILTER(LANG(?desc)="en") }
  OPTIONAL { ?s wdt:P411 ?canon }
  OPTIONAL { ?s wdt:P841 ?feast }
  OPTIONAL { ?s wdt:P31 ?type }
}`;
    const j = await getJSON(`${SPARQL}?format=json&query=${encodeURIComponent(query)}`);
    for (const b of j.results.bindings) {
      const id = b.s.value.split("/").pop();
      const e = (info[id] ??= { desc: "", canon: false, feast: false, types: new Set() });
      if (b.desc) e.desc = b.desc.value;
      if (b.canon) e.canon = true;
      if (b.feast) e.feast = true;
      if (b.type) e.types.add(b.type.value.split("/").pop());
    }
    await sleep(1200);
  }
  return info;
}

const trustworthy = (d) =>
  d &&
  !d.types.has(DISAMBIG) &&
  ![...d.types].some((t) => NAME_ITEM.has(t)) &&
  (d.canon || d.feast || CHRISTIAN.test(d.desc));

/* --------------------------------- build --------------------------------- */

const overrides = JSON.parse(
  readFileSync(join(here, "wiki-overrides.json"), "utf8"),
);

console.log("reading romcal…");
const rows = fromRomcal();
console.log(`  ${rows.length} celebrations`);

// An override is the last word: it exists because a guess was already wrong.
const guesses = new Map();
for (const r of rows) {
  if (r.id in overrides) {
    guesses.set(r.id, overrides[r.id] ? [overrides[r.id]] : []);
  } else {
    guesses.set(r.id, [...new Set([titleFromId(r.id), titleFromName(r.en)].filter(Boolean))]);
  }
}

console.log("resolving wikipedia titles…");
const resolved = await resolveTitles([...new Set([...guesses.values()].flat())]);

for (const r of rows) {
  for (const t of guesses.get(r.id)) {
    const hit = resolved[t];
    if (hit?.qid && !hit.disambig) {
      r.wiki = hit.title;
      r.wd = hit.qid;
      if (hit.ar) r.wikiAr = hit.ar;
      break;
    }
  }
}

console.log("verifying what those links point at…");
const info = await describe([...new Set(rows.filter((r) => r.wd).map((r) => r.wd))]);

const rejected = [];
for (const r of rows) {
  if (!r.wd) continue;
  if (trustworthy(info[r.wd])) continue;
  rejected.push(`${r.on ?? "E" + r.easter}  ${r.id}  ->  ${r.wiki} (${r.wd}) :: ${info[r.wd]?.desc ?? "?"}`);
  delete r.wiki;
  delete r.wd;
  delete r.wikiAr;
}

/* --------------------------------- write --------------------------------- */

const out = rows.map((r) => {
  const o = { id: r.id, rank: r.rank, colour: r.colour };
  if (r.on) o.on = r.on;
  if (r.easter !== undefined) o.easter = r.easter;
  o.en = r.en;
  if (r.la) o.la = r.la;
  if (r.wikiAr) o.ar = r.wikiAr;
  if (r.died !== undefined) o.died = r.died;
  if (r.holyDay) o.holyDay = true;
  if (r.wiki) o.wiki = r.wiki;
  if (r.wd) o.wd = r.wd;
  return o;
});

writeFileSync(
  join(root, "src", "data", "liturgy", "roman.json"),
  JSON.stringify(
    {
      version: 1,
      _readme: [
        "GENERATED by scripts/liturgy/build-roman.mjs — do not edit by hand.",
        "Dates, ranks and colours come from romcal's general-roman bundle.",
        "`wiki` is an English Wikipedia article title, `ar` the Arabic one,",
        "`wd` the Wikidata id. Every link is verified to point at a Christian",
        "subject; anything that could not be verified ships with no link at all.",
        "Hand corrections belong in scripts/liturgy/wiki-overrides.json.",
      ],
      feasts: out,
    },
    null,
    1,
  ) + "\n",
);

const linked = out.filter((r) => r.wiki).length;
const arabic = out.filter((r) => r.ar).length;
console.log(`\nwrote src/data/liturgy/roman.json`);
console.log(`  ${out.length} celebrations`);
console.log(`  ${linked} with a reference link (${out.length - linked} without)`);
console.log(`  ${arabic} with an Arabic article`);

if (rejected.length) {
  console.log(`\n${rejected.length} link(s) rejected by verification — add to wiki-overrides.json:`);
  for (const r of rejected) console.log("  " + r);
}
const nolink = out.filter((r) => !r.wiki);
if (nolink.length) {
  console.log(`\n${nolink.length} with no link at all:`);
  for (const r of nolink) console.log(`  ${r.on ?? "E" + r.easter}  ${r.id}`);
}
