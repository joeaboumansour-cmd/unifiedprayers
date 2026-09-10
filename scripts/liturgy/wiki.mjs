/**
 * Resolving a saint to an article, and checking the answer.
 *
 * Shared by the two build scripts beside it, because the generated Roman table
 * and the hand-written one need exactly the same thing done to them and the
 * checking is the part that must not drift between the two.
 *
 * The whole approach rests on one asymmetry: guessing an article title is easy
 * and gets it right most of the time, and the times it is wrong are silent.
 * "Saint Titus" resolves to a gorilla in Rwanda. "Saint Andrew" resolves to an
 * article about the name Andrew. Nothing errors, nothing looks unusual, and the
 * reader taps through to the wrong page. So every guess is verified against
 * what Wikidata says the subject actually *is*, and anything that cannot be
 * shown to be a Christian subject is dropped rather than shipped.
 */

const UA = "UnifiedPrayers/1.0 (liturgical calendar build; joeaboumansour@gmail.com)";
const WIKI = "https://en.wikipedia.org/w/api.php";
const SPARQL = "https://query.wikidata.org/sparql";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wikimedia answers a rate limit with plain text, not JSON, and a 200. So the
 * parse failure *is* the error signal, and backing off is the only handling.
 */
export async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      if (i === tries - 1) throw new Error(`bad response: ${text.slice(0, 160)}`);
      await sleep(3000 * (i + 1));
    }
  }
}

/**
 * Resolves English Wikipedia titles in batches, following redirects, and brings
 * the Arabic article back with each one.
 */
export async function resolveTitles(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 45) {
    const batch = titles.slice(i, i + 45);
    const url =
      `${WIKI}?action=query&format=json&redirects=1&prop=pageprops|langlinks` +
      `&lllang=ar&lllimit=500&titles=${encodeURIComponent(batch.join("|"))}`;
    const j = await getJSON(url);

    // Both maps are many-to-one: several asked-for titles can land on one page.
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
       * File the answer under the page's own title *and* under every title
       * that led here, walking the chain back.
       *
       * Both, not just the sources: "Joseph the Worker" redirects to "Saint
       * Joseph" and a build can ask for both — one as a guess, one as an
       * override. Filing it only under the redirect's source leaves the title
       * that was asked for directly with no answer, and the Solemnity of Saint
       * Joseph ships with no link while the May memorial has one.
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

/** Asks Wikidata what each matched entity actually is. */
export async function describe(qids) {
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

/** A description that reads as Christian. Anything else is a mis-hit. */
const CHRISTIAN =
  /saint|martyr|pope|bishop|priest|nun|monk|abbot|abbess|virgin|christian|catholic|maronite|syriac|orthodox|apostle|evangelist|theolog|mystic|missionary|hermit|friar|jesuit|franciscan|dominican|carmelite|stylite|ascetic|feast|liturg|church|deacon|archbishop|patriarch|cardinal|blessed|religious|holy|mary|jesus|angel|prophet|disciple|confessor|doctor|basilica|cross|nativity|annunciation|bibl|devotion|veneration|shrine|marian|sanctuary|pilgrimage|monastery|abbey|easter|paschal|lent|advent|epiphan|pentecost|resurrection|passion|vigil/i;

const DISAMBIG = "Q4167410";
/** "male/female/unisex given name", "family name". */
const NAME_ITEM = new Set(["Q101352", "Q12308941", "Q11879590", "Q3409032"]);

/** Whether a resolved entity is safe to put in front of a reader as a link. */
export const trustworthy = (d) =>
  Boolean(
    d &&
      !d.types.has(DISAMBIG) &&
      ![...d.types].some((t) => NAME_ITEM.has(t)) &&
      (d.canon || d.feast || CHRISTIAN.test(d.desc)),
  );
