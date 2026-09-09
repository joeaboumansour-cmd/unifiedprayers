/**
 * The calendar the Calendar tab reads.
 *
 * Two churches, one engine. `src/data/liturgy.json` holds every celebration
 * with a tag saying who keeps it; the season modules beside this file know how
 * each church shapes its year; and everything below joins the two into a day,
 * a month or a run of days.
 *
 * There is no fetch anywhere in here and there never should be. The whole
 * liturgical year for any year at all is arithmetic over a table that ships in
 * the bundle, which is the only reason a phone in flight mode can still tell
 * you it is the Fourth Sunday of the Holy Cross.
 */

import table from "@/data/liturgy.json";
import type { Lang } from "@/lib/content";
import {
  addDays,
  at,
  dayKey,
  fromEaster,
  monthDay,
} from "@/lib/liturgy/computus";
import { maroniteYear } from "@/lib/liturgy/maronite";
import { romanYear } from "@/lib/liturgy/roman";
import {
  RANK_WEIGHT,
  RITES,
  type LitColour,
  type Rank,
  type Rite,
  type RiteYear,
  type Season,
} from "@/lib/liturgy/types";

/** One row of the shipped table, before a rite and a language are applied. */
type RawFeast = {
  id: string;
  on?: string;
  easter?: number;
  sunday?: { month: number; nth: number };
  rites?: Rite[];
  rank: Rank;
  colour: LitColour;
  high?: boolean;
  en: string;
  ar: string;
  noteEn?: string;
  noteAr?: string;
};

const FEASTS = (table as { feasts: RawFeast[] }).feasts;

const YEARS: Record<Rite, RiteYear> = {
  maronite: maroniteYear,
  roman: romanYear,
};

/** A celebration resolved for one reader: their language, their church. */
export type Feast = {
  id: string;
  name: string;
  rank: Rank;
  colour: LitColour;
  /** Which churches keep it — shown when that is not only the reader's own. */
  rites: Rite[];
  /**
   * Kept by the Latin church rather than the reader's own, and showing only
   * because they asked for that second layer. Labelled in the UI, so nobody
   * mistakes a Latin memorial for something their parish will mark.
   */
  borrowed: boolean;
  high: boolean;
  note?: string;
};

export type Day = {
  key: string;
  date: Date;
  sunday: boolean;
  season: Season;
  /** The Sunday's proper name, the day's principal feast, or a plain line. */
  title: string;
  feasts: Feast[];
  /** Sets the date in gold: a solemnity, or a day that outranks its own title. */
  high: boolean;
};

export type MonthCell = Day & {
  /** Spilled in from the month either side, to fill the first and last rows. */
  outside: boolean;
};

export type CalendarView = {
  rite: Rite;
  /**
   * Lay the Latin general calendar under the reader's own. Most Maronites in
   * the diaspora keep both, so this is on by default — and it is a no-op for
   * a reader whose church already is the Latin one.
   */
  alsoRoman: boolean;
  lang: Lang;
};

/* ------------------------------ resolution ------------------------------ */

const rawRites = (f: RawFeast): Rite[] => f.rites ?? RITES;

/** Whether a row falls on this date, in whichever of the three forms it uses. */
function falls(f: RawFeast, d: Date): boolean {
  if (f.on) return f.on === monthDay(d);
  if (f.easter !== undefined) return f.easter === fromEaster(d);
  if (f.sunday) {
    return (
      d.getDay() === 0 &&
      d.getMonth() + 1 === f.sunday.month &&
      Math.ceil(d.getDate() / 7) === f.sunday.nth
    );
  }
  return false;
}

function feastsOn(d: Date, view: CalendarView): Feast[] {
  const ar = view.lang === "ar";
  const out: Feast[] = [];

  for (const f of FEASTS) {
    if (!falls(f, d)) continue;
    const rites = rawRites(f);
    const own = rites.includes(view.rite);
    // The second layer is Latin only, and only for a reader who is not already
    // reading the Latin calendar.
    const lent = view.alsoRoman && view.rite !== "roman" && rites.includes("roman");
    if (!own && !lent) continue;

    out.push({
      id: f.id,
      name: ar ? f.ar : f.en,
      rank: f.rank,
      colour: f.colour,
      rites,
      borrowed: !own,
      high: Boolean(f.high) || f.rank === "solemnity",
      note: (ar ? f.noteAr : f.noteEn) || undefined,
    });
  }

  // Highest rank first, so the day is filed under the celebration that
  // actually shapes it and the grid's three dots are the three that matter.
  return out.sort((a, b) => RANK_WEIGHT[b.rank] - RANK_WEIGHT[a.rank]);
}

/** Everything the app knows about one day. */
export function dayInfo(d: Date, view: CalendarView): Day {
  const year = YEARS[view.rite];
  const season = year.seasonOf(d, view.lang);
  const feasts = feastsOn(d, view);
  const sunday = d.getDay() === 0;
  const proper = sunday ? year.sundayOf(d, view.lang) : null;

  return {
    key: dayKey(d),
    date: d,
    sunday,
    season,
    title:
      proper?.title ??
      feasts[0]?.name ??
      (view.lang === "ar" ? "يوم من أيام الزمن" : "A weekday of the season"),
    feasts,
    high: Boolean(proper?.high) || feasts.some((f) => f.high),
  };
}

/* -------------------------------- builders ------------------------------- */

/**
 * Six weeks of cells for a month grid, trimmed to five when the last row is
 * entirely next month's. Always starts on a Sunday, because the week does.
 */
export function buildMonth(
  year: number,
  month: number,
  view: CalendarView,
): MonthCell[] {
  const first = at(year, month, 1);
  const cells: MonthCell[] = [];

  for (let i = 0; i < 42; i++) {
    const d = addDays(first, i - first.getDay());
    cells.push({ ...dayInfo(d, view), outside: d.getMonth() !== month });
  }

  // A month that fits in five rows should not draw a sixth of nothing but
  // greyed-out dates.
  if (cells.slice(35).every((c) => c.outside)) cells.length = 35;
  return cells;
}

/**
 * The days worth listing over the next `span` days: every Sunday, and every
 * day that keeps something. An empty Tuesday in Ordinary Time is not an
 * agenda entry, it is a gap — and showing it would bury the days that are.
 */
export function buildAgenda(from: Date, span: number, view: CalendarView): Day[] {
  const out: Day[] = [];
  for (let i = 0; i < span; i++) {
    const day = dayInfo(addDays(from, i), view);
    if (day.sunday || day.feasts.length > 0) out.push(day);
  }
  return out;
}

export { RITES, RITE_LABEL, RITE_HINT, RANK_LABEL, COLOUR_LABEL, colourVar } from "@/lib/liturgy/types";
export type { Rite, Rank, LitColour, Season } from "@/lib/liturgy/types";
