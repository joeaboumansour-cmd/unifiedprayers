import { timingSafeEqual } from "node:crypto";

import { denied, json, serviceClient, unconfigured } from "@/lib/server/supabase";
import type { Rite } from "@/lib/liturgy/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Nine days across six calendars, fetched politely one at a time. */
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
 * evangelizo.org does, for six of them, in Arabic — but its feed refuses any
 * date more than thirty days from today. So this runs nightly over a small
 * window and keeps what it finds. The archive is the point: after a year of
 * running, the app can show the readings for a date somebody scrolled to
 * rather than only for today, which is the whole difference between a calendar
 * and a homepage.
 *
 * ON THE RIGHTS. The references — "Luke 18:31-34" — are facts and free. The
 * texts are a specific translation (for the Maronite rite, the Maronite
 * Liturgical Translation of 2007) belonging to the commission that made it,
 * served by evangelizo.org for display on a page. Mirroring them is fine for
 * building against; putting them in front of readers needs permission from
 * both. Every row stores `source` and `translation` so that whatever is shown
 * can say whose words it is, and the references alone are always publishable —
 * see the note at the top of migration 0010.
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
 */
const SOURCES: Partial<Record<Rite, { lang: string; translation: string }>> = {
  roman: { lang: "AR", translation: "الترجمة العربية المشتركة" },
  maronite: { lang: "MAA", translation: "الترجمة الليتُرجيّة المارونيّة (2007)" },
  melkite: { lang: "BYA", translation: "الترجمة الليتُرجيّة البيزنطيّة" },
  "syriac-catholic": { lang: "SYA", translation: "الترجمة الليتُرجيّة السريانيّة" },
  "coptic-catholic": { lang: "COA", translation: "الترجمة الليتُرجيّة القبطيّة" },
  armenian: { lang: "ARM", translation: "Armenian liturgical translation" },
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
};

type Row = {
  on_date: string;
  rite: Rite;
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

/** One day of one calendar. */
async function fetchDay(rite: Rite, compact: string, iso: string): Promise<Row | null> {
  const src = SOURCES[rite];
  if (!src) return null;
  const url = `${FEED}?date=${compact}&type=xml&lang=${src.lang}`;

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

export async function GET(req: Request) {
  if (!authorised(req)) return denied();
  const supabase = serviceClient();
  if (!supabase) return unconfigured();

  const window = days();
  const rites = Object.keys(SOURCES) as Rite[];
  const rows: Row[] = [];
  let asked = 0;
  let missing = 0;
  const failed: string[] = [];

  for (const rite of rites) {
    for (const { iso, compact } of window) {
      asked++;
      try {
        const row = await fetchDay(rite, compact, iso);
        if (row) rows.push(row);
        else missing++;
      } catch {
        failed.push(`${rite} ${iso}`);
      }
      // One request at a time with a pause between. This is somebody else's
      // small service and the job has all night; there is no reason to be
      // anything but slow with it.
      await sleep(350);
    }
  }

  let written = 0;
  if (rows.length) {
    // Upsert on the key, so a re-run replaces what it fetched before rather
    // than failing. Cron delivery is at-least-once and a retry must be a no-op.
    const { error, count } = await supabase
      .from("daily_readings")
      .upsert(rows, { onConflict: "on_date,rite", count: "exact" });
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
    window: { from: window[0].iso, to: window[window.length - 1].iso },
    rites,
  });
}
