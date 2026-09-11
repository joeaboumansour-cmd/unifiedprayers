/**
 * The Coptic Orthodox year.
 *
 * The only rite here that does not keep its fixed feasts on the ordinary
 * calendar at all. The Coptic year is thirteen months — twelve of thirty days
 * and a short one of five, six before a leap year — counted from the accession
 * of Diocletian in 284, the Era of the Martyrs. So a Coptic feast is not "7
 * January": it is 29 Koiak, which *falls* on 7 January in most years and on the
 * 8th in the year after a Coptic leap. Writing those feasts as Gregorian dates
 * would be right for three years in four, which is the worst kind of wrong.
 *
 * That is why the table gets a fourth date form, `coptic: { month, day }`, and
 * why the conversion below is real arithmetic rather than a lookup: it has to
 * be right in 2100 as well.
 *
 * Pascha is the Julian reckoning, shared with the Byzantine year — the Coptic
 * and Greek churches keep Easter on the same Sunday, whatever else differs.
 */

import type { Lang } from "@/lib/content";
import { formatNum } from "@/lib/locale";
import {
  addDays,
  daysBetween,
  orthodoxEaster,
  sundayOnOrBefore,
} from "@/lib/liturgy/computus";
import { nthSunday, type RiteYear, type Season, type SundayInfo } from "@/lib/liturgy/types";

/* ------------------------------ conversion ------------------------------ */

/** The Julian Day Number of a Gregorian date, at local midnight. */
function gregorianToJDN(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return (
    d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) -
    Math.floor(yy / 100) + Math.floor(yy / 400) - 32045
  );
}

/** 1 Thout of the year 1, which is 29 August 284 in the Julian calendar. */
const COPTIC_EPOCH = 1825030;

const copticToJDN = (y: number, m: number, d: number): number =>
  COPTIC_EPOCH - 1 + 365 * (y - 1) + Math.floor(y / 4) + 30 * (m - 1) + d;

/** [year, month, day] in the Coptic calendar. Months are 1-13. */
export function copticOf(date: Date): [number, number, number] {
  const jdn = gregorianToJDN(date.getFullYear(), date.getMonth() + 1, date.getDate());
  let y = Math.floor((4 * (jdn - COPTIC_EPOCH + 1) + 1463) / 1461);
  // The estimate overshoots on the epagomenal days at the end of a year, where
  // the 365/366 split puts a date before its own year's first of Thout.
  if (jdn < copticToJDN(y, 1, 1)) y--;
  const doy = jdn - copticToJDN(y, 1, 1);
  return [y, Math.floor(doy / 30) + 1, (doy % 30) + 1];
}

/** Whether a date is the given day of the Coptic month. */
export function isCopticDay(date: Date, month: number, day: number): boolean {
  const [, m, d] = copticOf(date);
  return m === month && d === day;
}

/** The thirteen months, for the line the sheet shows under the date. */
const MONTHS: Record<Lang, string[]> = {
  en: ["Thout","Paopi","Hathor","Koiak","Tobi","Meshir","Paremhat","Parmouti",
       "Pashons","Paoni","Epip","Mesori","Nasie"],
  ar: ["توت","بابه","هاتور","كيهك","طوبة","أمشير","برمهات","برمودة",
       "بشنس","بؤونة","أبيب","مسرى","النسيء"],
};

/** "29 Koiak 1742" — the date as this church actually writes it. */
export function copticDateLine(date: Date, lang: Lang): string {
  const [y, m, d] = copticOf(date);
  const month = MONTHS[lang][m - 1];
  return lang === "ar"
    ? `${formatNum(d, lang)} ${month} ${formatNum(y, lang)} للشهداء`
    : `${d} ${month} ${y} AM`;
}

/* -------------------------------- the year ------------------------------- */

const NAME = {
  year: { ar: "زمن السنة", en: "The Church Year" },
  nativityFast: { ar: "صوم الميلاد", en: "The Nativity Fast" },
  lent: { ar: "الصوم الكبير", en: "The Great Fast" },
  holy: { ar: "أسبوع الآلام", en: "Holy Week" },
  fifty: { ar: "الخماسين المقدسة", en: "The Holy Fifty Days" },
  apostles: { ar: "صوم الرسل", en: "The Apostles' Fast" },
};

/**
 * The Great Fast is fifty-five days, not forty.
 *
 * A week of preparation precedes the forty, and Holy Week follows them, and the
 * Coptic church counts the whole stretch as one fast. It opens on a Monday
 * fifty-five days before Pascha.
 */
const GREAT_FAST_LENGTH = 55;

const MOVABLE_SUNDAYS: Record<number, Record<Lang, string> & { high?: boolean }> = {
  [-49]: { ar: "أحد الرفاع", en: "Sunday before the Great Fast" },
  [-7]: { ar: "أحد الشعانين", en: "Palm Sunday", high: true },
  [0]: { ar: "عيد القيامة المجيد", en: "The Feast of the Resurrection", high: true },
  [7]: { ar: "أحد توما — الأحد الجديد", en: "Thomas Sunday · New Sunday" },
  [49]: { ar: "عيد العنصرة", en: "Pentecost", high: true },
};

const MOVABLE_DAYS: Record<number, Record<Lang, string>> = {
  [-55]: { ar: "بدء الصوم الكبير", en: "The Great Fast begins" },
  [-6]: { ar: "اثنين البصخة", en: "Monday of Pascha Week" },
  [-3]: { ar: "خميس العهد", en: "Covenant Thursday" },
  [-2]: { ar: "الجمعة العظيمة", en: "Great Friday" },
  [-1]: { ar: "سبت الفرح", en: "Joyous Saturday" },
  [39]: { ar: "عيد الصعود", en: "the Ascension" },
};

function seasonOf(d: Date, lang: Lang): Season {
  const pascha = orthodoxEaster(d.getFullYear());
  const p = daysBetween(pascha, d);
  const week = (from: Date) => 1 + Math.round(daysBetween(from, sundayOnOrBefore(d)) / 7);

  if (p >= -GREAT_FAST_LENGTH && p < -7)
    return { id: "lent", name: NAME.lent[lang], colour: "violet",
             week: week(addDays(pascha, -GREAT_FAST_LENGTH)) };
  if (p >= -7 && p < 0)
    return { id: "holy", name: NAME.holy[lang], colour: "red", week: 1 };
  if (p >= 0 && p <= 49)
    return { id: "fifty", name: NAME.fifty[lang], colour: "white", week: week(pascha) };

  // The Apostles' Fast runs from the Monday after Pentecost to 5 Epip, so its
  // length changes with Pascha — the one fast whose end is fixed and whose
  // beginning is not.
  const [, cm, cd] = copticOf(d);
  if (p > 49 && (cm < 11 || (cm === 11 && cd < 5)))
    return { id: "apostles", name: NAME.apostles[lang], colour: "red", week: week(addDays(pascha, 49)) };

  // The Nativity Fast: forty-three days ending on 28 Koiak.
  if ((cm === 3 && cd >= 16) || (cm === 4 && cd <= 28))
    return { id: "nativity-fast", name: NAME.nativityFast[lang], colour: "violet",
             week: 1 + Math.floor((cm === 3 ? cd - 16 : cd + 14) / 7) };

  return { id: "year", name: NAME.year[lang], colour: "green", week: week(addDays(pascha, 49)) };
}

function sundayOf(d: Date, lang: Lang): SundayInfo {
  const p = daysBetween(orthodoxEaster(d.getFullYear()), d);
  const named = MOVABLE_SUNDAYS[p];
  if (named) return { title: named[lang], high: Boolean(named.high) };

  const s = seasonOf(d, lang);
  if (s.id === "year" || s.id === "apostles") {
    /*
     * "The third Sunday of the month of Thout".
     *
     * Outside the fast and the fifty days, this calendar does not count from
     * Pentecost the way the Byzantine and Syriac years do — it counts within
     * the Coptic month, and starts again at one when the month turns. Since
     * every month here is exactly thirty days, which Sunday of the month it is
     * follows straight from the day of the month.
     */
    const [, month, day] = copticOf(d);
    const nth = Math.floor((day - 1) / 7) + 1;
    const of = { ar: `من شهر ${MONTHS.ar[month - 1]}`, en: `of ${MONTHS.en[month - 1]}` };
    return { title: nthSunday(nth, of, lang), high: false };
  }
  return { title: lang === "ar" ? "يوم الرب" : "The Lord's Day", high: false };
}

/** The named weekdays — Covenant Thursday and the rest of Pascha Week. */
export function copticDayName(d: Date, lang: Lang): string | null {
  const p = daysBetween(orthodoxEaster(d.getFullYear()), d);
  return MOVABLE_DAYS[p]?.[lang] ?? null;
}

export const copticYear: RiteYear = { seasonOf, sundayOf };
