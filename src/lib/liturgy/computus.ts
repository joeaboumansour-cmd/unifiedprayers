/**
 * The movable feasts.
 *
 * Almost the whole liturgical year is arithmetic. Easter is the one thing that
 * has to be worked out; everything else — Lent, Ascension, Pentecost, the
 * Maronite Cana Sunday — is a fixed number of days either side of it, and
 * Advent and the Announcements count backwards from Christmas. So this file is
 * the only place a date is ever *derived*, and the rest of the calendar is a
 * lookup against what comes out of it.
 *
 * Nothing here touches the network or the clock, which is the point: an
 * offline phone in a village with no signal knows exactly as much about next
 * Easter as a server does.
 *
 * Both rites the app ships keep the Gregorian Easter. A rite on the Julian
 * reckoning — the Orthodox families, when they are added — needs a second
 * computus here and nothing else changed downstream, because every season
 * module below asks only for a Date.
 */

/** Local midnight on the given day. Never UTC: every date shown is local. */
export const at = (y: number, m: number, d: number): Date => new Date(y, m, d);

/** A new date `n` days along. Goes through the calendar, so DST cannot bite. */
export const addDays = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Whole days from `a` to `b`. Rounded because a span crossing a daylight-saving
 * change is 23 or 25 hours long and would otherwise floor to the wrong day.
 */
export const daysBetween = (a: Date, b: Date): number =>
  Math.round((b.getTime() - a.getTime()) / 86_400_000);

/** "YYYY-MM-DD" in local time — the key every lookup in the calendar uses. */
export const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

/** "MM-DD", for matching a fixed feast whatever the year. */
export const monthDay = (d: Date): string => dayKey(d).slice(5);

/** The same calendar day, ignoring the time of day either carries. */
export const sameDay = (a: Date, b: Date): boolean => dayKey(a) === dayKey(b);

/** The Sunday on or before `d`. Sunday itself comes back unchanged. */
export const sundayOnOrBefore = (d: Date): Date => addDays(d, -d.getDay());

/** The Sunday strictly before `d`. */
export const sundayBefore = (d: Date): Date =>
  addDays(d, -(d.getDay() === 0 ? 7 : d.getDay()));

/** The Sunday strictly after `d`. */
export const sundayAfter = (d: Date): Date => addDays(d, 7 - d.getDay());

/**
 * Gregorian Easter Sunday — the Meeus/Jones/Butcher algorithm.
 *
 * It is a closed form of the rule the Council of Nicaea settled: the Sunday
 * after the first ecclesiastical full moon on or after 21 March. The variable
 * names are the ones the algorithm is published under and mean nothing on
 * their own, so they are left as they are rather than given invented names
 * that would be no more honest.
 */
export function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return at(year, Math.floor(n / 31) - 1, (n % 31) + 1);
}

/** Days from Easter, negative before it. The offset every movable feast uses. */
export const fromEaster = (d: Date): number =>
  daysBetween(easter(d.getFullYear()), d);
