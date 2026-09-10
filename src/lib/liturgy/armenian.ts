/**
 * The Armenian Apostolic year.
 *
 * The one church that never split the Nativity from the Baptism. Everywhere
 * else in Christendom the two came apart in the fourth century, Christmas
 * moving to 25 December and the Epiphany staying on the 6th of January; the
 * Armenian church simply did not follow, and keeps both on 6 January as one
 * feast, which is what it was to begin with. That is not a variation on
 * Christmas — it is the older arrangement, kept.
 *
 * The other thing that shapes this calendar is that so much of it moves. Five
 * of its greatest feasts, the Tabernacle Feasts, are anchored to Sundays: the
 * Transfiguration is ninety-eight days after Easter, and the Assumption and the
 * Exaltation of the Cross fall on the Sunday *nearest* 15 August and 14
 * September rather than on the dates themselves. So the table needs a form for
 * "the Sunday nearest a date", which no other rite here uses.
 *
 * Easter is the Gregorian computus, as the Armenian church keeps it — with the
 * exception of the Patriarchate of Jerusalem, which is on the older reckoning.
 * This calendar is the former.
 */

import type { Lang } from "@/lib/content";
import {
  addDays,
  at,
  daysBetween,
  easter,
  sundayOnOrBefore,
} from "@/lib/liturgy/computus";
import { nthSunday, type RiteYear, type Season, type SundayInfo } from "@/lib/liturgy/types";

const NAME = {
  theophany: { ar: "زمن الظهور الإلهي", en: "The Season of Theophany" },
  lent: { ar: "الصوم الأربعيني", en: "Great Lent" },
  holy: { ar: "أسبوع الآلام", en: "Holy Week" },
  easter: { ar: "زمن القيامة", en: "Eastertide" },
  transfiguration: { ar: "زمن التجلّي", en: "After the Transfiguration" },
  cross: { ar: "زمن الصليب", en: "The Season of the Cross" },
  advent: { ar: "زمن المجيء", en: "Advent" },
};

const OF = {
  easter: { ar: "من زمن القيامة", en: "of Eastertide" },
  transfiguration: { ar: "بعد التجلّي", en: "after the Transfiguration" },
  cross: { ar: "من زمن الصليب", en: "of the Holy Cross" },
};

/**
 * The Sunday nearest a given day — the anchor of three Tabernacle Feasts.
 *
 * "Nearest" and not "on or before": a feast on the 15th of a month that falls
 * on a Tuesday is kept on the Sunday of the 13th, not the 20th. Ties cannot
 * happen, because a Wednesday is the only equidistant day and it resolves
 * forward here, matching how the Armenian calendars print it.
 */
export function sundayNearest(year: number, month: number, day: number): Date {
  const target = at(year, month - 1, day);
  const before = sundayOnOrBefore(target);
  const after = addDays(before, 7);
  return daysBetween(before, target) <= 3 ? before : after;
}

/** Whether a date is the Sunday nearest that day of the year. */
export const isSundayNearest = (d: Date, month: number, day: number): boolean =>
  d.getDay() === 0 &&
  daysBetween(sundayNearest(d.getFullYear(), month, day), d) === 0;

/** Days from Easter at which the movable feasts and Sundays sit. */
const MOVABLE_SUNDAYS: Record<number, Record<Lang, string> & { high?: boolean }> = {
  [-70]: { ar: "أحد الفرّيسي", en: "Sunday of the Pharisee" },
  [-63]: { ar: "أحد الابن الشاطر", en: "Sunday of the Prodigal Son" },
  [-49]: { ar: "أحد البون — بدء الصوم", en: "Poon Paregentan · Great Lent begins" },
  [-42]: { ar: "أحد الطرد", en: "Sunday of the Expulsion" },
  [-35]: { ar: "أحد الابن الضال", en: "Sunday of the Prodigal" },
  [-28]: { ar: "أحد الوكيل", en: "Sunday of the Steward" },
  [-21]: { ar: "أحد القاضي", en: "Sunday of the Judge" },
  [-14]: { ar: "أحد المجيء", en: "Sunday of the Advent" },
  [-7]: { ar: "أحد الشعانين", en: "Palm Sunday", high: true },
  [0]: { ar: "عيد القيامة المجيد", en: "Easter · the Resurrection", high: true },
  [7]: { ar: "الأحد الجديد", en: "New Sunday" },
  [49]: { ar: "عيد العنصرة", en: "Pentecost", high: true },
  [98]: { ar: "عيد الوردافار — التجلّي", en: "Vardavar · the Transfiguration", high: true },
};

const MOVABLE_DAYS: Record<number, Record<Lang, string>> = {
  [-3]: { ar: "خميس الأسرار", en: "Holy Thursday" },
  [-2]: { ar: "الجمعة العظيمة", en: "Great Friday" },
  [-1]: { ar: "سبت النور", en: "Holy Saturday" },
  [39]: { ar: "عيد الصعود", en: "the Ascension" },
};

function seasonOf(d: Date, lang: Lang): Season {
  const y = d.getFullYear();
  const e = easter(y);
  const p = daysBetween(e, d);
  const week = (from: Date) => 1 + Math.round(daysBetween(from, sundayOnOrBefore(d)) / 7);

  if (p >= -48 && p < -7)
    return { id: "lent", name: NAME.lent[lang], colour: "violet", week: week(addDays(e, -48)) };
  if (p >= -7 && p < 0)
    return { id: "holy", name: NAME.holy[lang], colour: "red", week: 1 };
  if (p >= 0 && p < 98)
    return { id: "easter", name: NAME.easter[lang], colour: "white", week: week(e) };

  const cross = sundayNearest(y, 9, 14);
  // Advent here is the seven weeks before the Nativity on 6 January, so it
  // begins in the middle of November and runs past Christmas as the West
  // keeps it — which for this church is an ordinary day.
  const advent = addDays(sundayOnOrBefore(at(y + 1, 0, 6)), -42);
  if (d >= advent)
    return { id: "advent", name: NAME.advent[lang], colour: "violet", week: week(advent) };
  if (d >= cross)
    return { id: "cross", name: NAME.cross[lang], colour: "red", week: week(cross) };
  if (p >= 98)
    return { id: "transfiguration", name: NAME.transfiguration[lang], colour: "green",
             week: week(addDays(e, 98)) };

  // Before Lent: still the season that opened with the Theophany.
  return { id: "theophany", name: NAME.theophany[lang], colour: "white",
           week: week(at(y, 0, 6)) };
}

function sundayOf(d: Date, lang: Lang): SundayInfo {
  const p = daysBetween(easter(d.getFullYear()), d);
  const named = MOVABLE_SUNDAYS[p];
  if (named) return { title: named[lang], high: Boolean(named.high) };

  const s = seasonOf(d, lang);
  if (s.id === "easter") return { title: nthSunday(s.week, OF.easter, lang), high: false };
  if (s.id === "transfiguration")
    return { title: nthSunday(s.week, OF.transfiguration, lang), high: false };
  if (s.id === "cross") return { title: nthSunday(s.week, OF.cross, lang), high: false };
  return { title: lang === "ar" ? "يوم الرب" : "The Lord's Day", high: false };
}

export function armenianDayName(d: Date, lang: Lang): string | null {
  return MOVABLE_DAYS[daysBetween(easter(d.getFullYear()), d)]?.[lang] ?? null;
}

export const armenianYear: RiteYear = { seasonOf, sundayOf };
