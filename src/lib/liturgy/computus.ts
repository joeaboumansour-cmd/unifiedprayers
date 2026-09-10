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

/**
 * Orthodox Pascha, as a date on the ordinary (Gregorian) calendar.
 *
 * The rule is the same rule — the Sunday after the first full moon on or after
 * 21 March — but reckoned on the Julian calendar, with the Julian March
 * equinox and the Metonic cycle uncorrected. Two things follow, and both are
 * the point rather than a rounding error:
 *
 *   The Julian calendar has drifted thirteen days behind the Gregorian, so the
 *   answer must be shifted forward to be shown on a phone. The shift is not a
 *   constant: it grows by a day each century that is not a leap year in the
 *   Gregorian reckoning, so it is computed rather than hard-coded at 13. It is
 *   13 for the whole of the 1900s and 2000s and becomes 14 in 2100.
 *
 *   Pascha can therefore fall as much as five weeks after the Western Easter,
 *   and once or twice a decade the two coincide. A church on this reckoning is
 *   not keeping a late Easter; it is keeping the older arithmetic.
 *
 * The Meeus Julian algorithm gives the day in the Julian calendar; the rest
 * converts it. Nothing here is used by the Latin or Maronite years, which both
 * keep the Gregorian computus above.
 */
export function orthodoxEaster(year: number): Date {
  // Meeus, Julian algorithm: the residues a/b/c and the day it lands on.
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31); // 3 = March, 4 = April
  const day = ((d + e + 114) % 31) + 1;

  // Julian -> Gregorian. Whole centuries that the Gregorian reform does not
  // count as leap years are exactly the days the two calendars differ by.
  const century = Math.floor(year / 100);
  const drift = century - Math.floor(century / 4) - 2;

  return at(year, month - 1, day + drift);
}

/** Days from Easter, negative before it. The offset every movable feast uses. */
export const fromEaster = (d: Date): number =>
  daysBetween(easter(d.getFullYear()), d);

/** The same, against Orthodox Pascha. */
export const fromPascha = (d: Date): number =>
  daysBetween(orthodoxEaster(d.getFullYear()), d);
