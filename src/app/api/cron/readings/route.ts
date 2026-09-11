import { timingSafeEqual } from "node:crypto";

import { denied, json, serviceClient, unconfigured } from "@/lib/server/supabase";
import { arabicReading } from "@/lib/server/vanDyck";
import type { Rite } from "@/lib/liturgy/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Nine days across seven feeds and orthocal, fetched politely one at a time. */
export const maxDuration = 300;

/**
 * The readings mirror.
 *
 * Everything else this app knows about the calendar is arithmetic — nine
 * churches' years computed from a table that ships in the bundle, with no
 * network anywhere. The readings are the exception and cannot be otherwise:
 * which passages are appointed for a Thursday in the sixteenth week of
 * Pentecost is a decision a liturgical commission publishes, not something a
 * date implies, and none of these churches publishes it as data.
 *
 * Two sources, because no one of them covers these churches.
 *
 *   evangelizo.org  the six Catholic calendars, in Arabic — and the Maronite
 *                   one in English as well. Its feed refuses any date more
 *                   than thirty days from today, so this half can only ever be
 *                   grown forwards, a week at a time, night after night. The
 *                   archive is the point: after a year of running the app
 *                   shows the readings for a date somebody scrolled to and not
 *                   only for today, which is the whole difference between a
 *                   calendar and a homepage.
 *
 *   orthocal.info   the Byzantine Orthodox calendar, in English. It computes
 *                   rather than looks up, so it has no window at all and a
 *                   whole year can be seeded in one run — see `?from=&to=`
 *                   below. Its scripture is the King James Version; the same
 *                   verses are also looked up in the Arabic Van Dyck Bible so
 *                   the Orthodox calendar has an Arabic row too.
 *
 * Each row is one language (migration 0012), and the app shows the one in the
 * reader's language where it exists and whichever does where it does not.
 *
 * ON THE RIGHTS, which differ by source and so are not one rule.
 *
 * References — "Luke 18:31-34" — are facts either way and free.
 *
 * The evangelizo texts are a particular translation (for the Maronite rite the
 * Maronite Liturgical Translation of 2007) belonging to the commission that
 * made it. Permission for this app has been obtained; every row still stores
 * `source` and `translation` and the UI prints both, because a reading shown
 * bare is a reading a reader will take for ours.
 *
 * The orthocal texts are the King James Version and are public domain, so that
 * half carries no permission question at all. Nor does its Arabic: Van Dyck
 * (1865) is public domain too.
 *
 * Neither source's editorial writing is mirrored — evangelizo's daily
 * commentary and orthocal's saints' lives are both left where they are.
 */

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Anything else fails. */
function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The app's rites against evangelizo's calendar codes.
 *
 * Six, not nine. Evangelizo is a Catholic service: its Byzantine calendar is
 * the Melkite one and its Syriac and Coptic calendars are those churches'
 * Catholic branches. Pointing the Orthodox rites at them would be mirroring a
 * Catholic calendar under an Orthodox name, which is exactly the kind of quiet
 * wrongness this file should not introduce — the Orthodox three are left with
 * no readings until there is a source that is actually theirs.
 *
 * A rite can have more than one feed, one per language. Only the Maronite does
 * so far: evangelizo's `MAE` is the Maronite calendar in English. It is missing
 * from the feed's own list of codes but answers, and it is the same lectionary
 * as `MAA` — same day title, same passages — in the NRSV. It numbers its slots
 * differently (the Arabic puts a weekday epistle in slot three, the English in
 * slot two), which the client evens out; see `useReadings`.
 */
type Lang = "ar" | "en" | "hy";

type Feed = { code: string; lang: Lang; translation: string };

const SOURCES: Partial<Record<Rite, Feed[]>> = {
  roman: [{ code: "AR", lang: "ar", translation: "الترجمة العربية المشتركة" }],
  maronite: [
    { code: "MAA", lang: "ar", translation: "الترجمة الليتُرجيّة المارونيّة (2007)" },
    { code: "MAE", lang: "en", translation: "New Revised Standard Version" },
  ],
  melkite: [{ code: "BYA", lang: "ar", translation: "الترجمة الليتُرجيّة البيزنطيّة" }],
  "syriac-catholic": [{ code: "SYA", lang: "ar", translation: "الترجمة الليتُرجيّة السريانيّة" }],
  "coptic-catholic": [{ code: "COA", lang: "ar", translation: "الترجمة الليتُرجيّة القبطيّة" }],
  armenian: [{ code: "ARM", lang: "hy", translation: "Armenian liturgical translation" }],
};

/**
 * How far either side of today to mirror.
 *
 * The feed's own limit is thirty days; staying well inside it leaves room for
 * a run that is a day late without a gap appearing, and two days back re-fetch
 * days whose readings were still empty when they were first asked for.
 */
const BACK = 2;
const FORWARD = 6;

const FEED = "http://feed.evangelizo.org/v2/reader.php";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The CDATA payload of one tag, trimmed, or null when the tag is empty. */
function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${name}>`));
  const v = m?.[1]?.trim();
  return v ? v : null;
}

/** "YYYY-MM-DD" and the "YYYYMMDD" the feed wants. */
function days(): { iso: string; compact: string }[] {
  const out: { iso: string; compact: string }[] = [];
  const now = new Date();
  for (let i = -BACK; i <= FORWARD; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ iso, compact: iso.replace(/-/g, "") });
  }
  return out;
}

type Reading = {
  /** Which of the feed's slots this came from. */
  kind: string;
  /** What this reading is, in the rite's own words. */
  label: string | null;
  /** The reference, abbreviated the way the rite abbreviates it. A fact. */
  ref: string | null;
  /** The translation. See the rights note above and in migration 0010. */
  text: string | null;
  /** Only where one reading is not in its row's language — see vanDyck.ts. */
  lang?: "en";
};

/**
 * An explicit span of days, for seeding. Capped: a request for a decade would
 * be thousands of fetches inside one function's timeout, and the cap makes the
 * failure "you asked for too much" rather than a run that dies half-written.
 */
function range(from: string, to: string): { iso: string; compact: string }[] {
  const out: { iso: string; compact: string }[] = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const end = new Date(ty, tm - 1, td);
  const cur = new Date(fy, fm - 1, fd);
  while (cur <= end && out.length < 400) {
    const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    out.push({ iso, compact: iso.replace(/-/g, "") });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

type Row = {
  on_date: string;
  rite: Rite;
  /** What the text is in. The third part of the key since migration 0012. */
  lang: Lang;
  liturgic_title: string | null;
  readings: Reading[];
  audio_url: string | null;
  source: string;
  translation: string;
};

/**
 * The feed's reading slots, in the order a service reads them.
 *
 * Three numbered slots and then a gospel under its own name — not four numbered
 * ones, which is what the parameter documentation implies and what this file
 * assumed until the XML was actually read. What the numbered slots *hold*
 * depends on the rite: the Roman form puts a first reading and a psalm in one
 * and two, the Maronite leaves both empty and uses three for the epistle, and
 * the Byzantine puts a prokeimenon in one and an alleluia verse in three. So
 * nothing here decides what a slot means; each reading carries the label the
 * source gave it and the app prints that.
 */
const SLOTS = ["text1", "text2", "text3", "gospel"] as const;

/** One day of one calendar in one language. */
async function fetchDay(rite: Rite, src: Feed, compact: string, iso: string): Promise<Row | null> {
  const url = `${FEED}?date=${compact}&type=xml&lang=${src.code}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "UnifiedPrayers/1.0 (liturgical calendar; joeaboumansour@gmail.com)" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const xml = await res.text();

  const readings: Reading[] = [];
  for (const kind of SLOTS) {
    const label = tag(xml, `reading_${kind}_lt`);
    const ref = tag(xml, `reading_${kind}_st`);
    const text = tag(xml, `reading_${kind}`);
    // An empty slot is an empty slot, not a reading with nothing in it.
    if (!label && !ref && !text) continue;
    readings.push({ kind, label, ref, text });
  }

  const row: Row = {
    on_date: iso,
    rite,
    lang: src.lang,
    // The feed's own spelling of the tag, missing its 'r'. Not a typo here.
    liturgic_title: tag(xml, "litugic_t"),
    readings,
    audio_url: tag(xml, "reading_gospel_audiourl"),
    source: "evangelizo.org",
    translation: src.translation,
  };

  /* Nothing at all means the feed has nothing for that day, not that the day
     has nothing in it — storing that would let a later run overwrite a good
     row with an empty one. Evangelizo's commentary is read past deliberately:
     it is their editorial work and this app has no use for a copy of it. */
  if (!row.liturgic_title && readings.length === 0) return null;
  return row;
}

/* ------------------------------- orthocal -------------------------------- */

/**
 * The Orthodox rites, from orthocal.info.
 *
 * A different source with different properties, and both differences matter.
 *
 * It computes rather than looks up, so it has no thirty-day window: any date in
 * any year answers, which is why the range below can be widened to seed a whole
 * year in one run where evangelizo can only ever be crawled forwards a week at
 * a time. It also independently confirms this app's Pascha — ask it for 19
 * April 2020 or 2 May 2027 and it returns Holy Pascha at distance zero, which
 * is what `orthodoxEaster` computes.
 *
 * And its scripture is the King James Version, which is public domain. So
 * unlike the evangelizo half of this file there is no permission question over
 * these texts at all. Its saints' lives are another matter and are not
 * mirrored, on the same principle as evangelizo's commentary.
 *
 * orthocal is English only. The Arabic row beside each English one is not a
 * translation of it: every orthocal reading arrives as its verses, numbered,
 * and those same verses are looked up in the Van Dyck Bible. Where Van Dyck
 * has no text — Wisdom, Baruch, orthocal's composites — that one reading keeps
 * its English and is marked so. See src/lib/server/vanDyck.ts.
 */
const ORTHOCAL: Partial<Record<Rite, string>> = {
  // Gregorian fixed dates with the Julian Pascha, which is this app's
  // byzantine rite exactly. The /julian/ endpoint is the old-calendar
  // churches and would be a separate rite, not a flag on this one.
  byzantine: "gregorian",
};

type OrthocalReading = {
  source?: string;
  display?: string;
  short_display?: string;
  passage?: { content?: string; book?: string; chapter?: number; verse?: number }[];
};

/** One day of the Orthodox calendar: the English row, and its Arabic twin. */
async function fetchOrthocal(rite: Rite, iso: string): Promise<Row[]> {
  const calendar = ORTHOCAL[rite];
  if (!calendar) return [];
  const [y, m, d] = iso.split("-").map(Number);

  const res = await fetch(`https://orthocal.info/api/${calendar}/${y}/${m}/${d}/`, {
    headers: { "User-Agent": "UnifiedPrayers/1.0 (liturgical calendar; joeaboumansour@gmail.com)" },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const day = (await res.json()) as {
    titles?: string[];
    readings?: OrthocalReading[];
  };

  const readings: Reading[] = [];
  const arabic: Reading[] = [];
  (day.readings ?? []).forEach((r, i) => {
    const text = (r.passage ?? [])
      .map((v) => v.content?.trim())
      .filter(Boolean)
      .join("\n");
    if (!text && !r.display) return;
    /* Unique per row because it keys the list in the UI, and a day can carry
       two readings from the same office — two at Matins is ordinary. The Arabic
       twin shares it, so a reading ticked off in one language is ticked off in
       the other. */
    const kind = `${(r.source ?? "reading").toLowerCase().replace(/\s+/g, "-")}-${i}`;
    readings.push({
      kind,
      /* "Mark 6.30-45" names the book, which is what the reader wants to see;
         the office it belongs to rides in front of it where there is one, so a
         Matins gospel does not read as the Liturgy's. */
      label: r.source && r.display ? `${r.source} · ${r.display}` : (r.display ?? r.source ?? null),
      ref: r.short_display ?? r.display ?? null,
      text: text || null,
    });
    arabic.push({ kind, ...arabicReading({ ...r, english: text || null }) });
  });

  if (!day.titles?.length && readings.length === 0) return [];

  const english: Row = {
    on_date: iso,
    rite,
    lang: "en",
    liturgic_title: day.titles?.[0] ?? null,
    readings,
    audio_url: null,
    source: "orthocal.info",
    translation: "King James Version",
  };

  // Said plainly on the row when some of it could not be given in Arabic.
  const mixed = arabic.some((r) => r.lang === "en");
  return [
    english,
    {
      ...english,
      lang: "ar",
      readings: arabic,
      source: "orthocal.info · eBible.org",
      translation: mixed ? "ترجمة فان دايك · King James Version" : "ترجمة فان دايك",
    },
  ];
}

export async function GET(req: Request) {
  if (!authorised(req)) return denied();
  const supabase = serviceClient();
  if (!supabase) return unconfigured();

  /*
   * `?from=&to=` seeds a range instead of running the nightly window.
   *
   * Only the orthocal rites can use it, and that is not a restriction this
   * file invented: evangelizo refuses any date more than thirty days out, so
   * for those six there is nothing to seed — the archive can only ever be
   * grown forwards, one night at a time. Orthocal computes, so a year of the
   * Byzantine calendar can be filled in one run.
   */
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const seeding = Boolean(from && to);

  const window = seeding ? range(from!, to!) : days();
  const rows: Row[] = [];
  let asked = 0;
  let missing = 0;
  const failed: string[] = [];

  const evangelizoRites = seeding ? [] : (Object.keys(SOURCES) as Rite[]);
  const orthocalRites = Object.keys(ORTHOCAL) as Rite[];

  for (const rite of evangelizoRites) {
    for (const feed of SOURCES[rite] ?? []) {
      for (const { iso, compact } of window) {
        asked++;
        try {
          const row = await fetchDay(rite, feed, compact, iso);
          if (row) rows.push(row);
          else missing++;
        } catch {
          failed.push(`${rite}/${feed.lang} ${iso}`);
        }
        // One request at a time with a pause between. This is somebody else's
        // small service and the job has all night; there is no reason to be
        // anything but slow with it.
        await sleep(350);
      }
    }
  }

  for (const rite of orthocalRites) {
    for (const { iso } of window) {
      asked++;
      try {
        const got = await fetchOrthocal(rite, iso);
        if (got.length) rows.push(...got);
        else missing++;
      } catch {
        failed.push(`${rite} ${iso}`);
      }
      await sleep(250);
    }
  }

  let written = 0;
  if (rows.length) {
    // Upsert on the key, so a re-run replaces what it fetched before rather
    // than failing. Cron delivery is at-least-once and a retry must be a no-op.
    const { error, count } = await supabase
      .from("daily_readings")
      .upsert(rows, { onConflict: "on_date,rite,lang", count: "exact" });
    if (error) return json({ ok: false, error: error.message, asked, fetched: rows.length }, 500);
    written = count ?? rows.length;
  }

  return json({
    ok: true,
    asked,
    fetched: rows.length,
    written,
    missing,
    failed,
    window: { from: window[0]?.iso ?? null, to: window[window.length - 1]?.iso ?? null },
    seeding,
    rites: [...evangelizoRites, ...orthocalRites],
  });
}
