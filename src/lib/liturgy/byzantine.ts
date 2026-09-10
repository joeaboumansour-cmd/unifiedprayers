/**
 * The Byzantine liturgical year — the Orthodox calendar.
 *
 * Two reckonings meet in this file, and keeping them apart is the whole job.
 * The fixed feasts sit on the ordinary calendar: Christmas is 25 December, the
 * Dormition is 15 August, and a phone showing this calendar shows them where
 * the reader's own diary shows them. Pascha, and everything hung off it, is
 * computed on the *Julian* reckoning — see `orthodoxEaster` in computus — which
 * is why it can fall five weeks after the Western Easter and why, three or four
 * times a decade, the two land on the same Sunday.
 *
 * That combination is not a compromise: it is what the Antiochian, Greek,
 * Romanian and Bulgarian churches actually keep, and the Antiochian church is
 * the one a reader in Lebanon is most likely to belong to. The churches that
 * keep the old calendar for the fixed feasts too — the Russian, the Serbian,
 * Jerusalem — run thirteen days behind on those, and this file does not try to
 * be them as well; that is a second rite, not a flag.
 *
 * The year runs from the first of September, the Indiction, and its shape is
 * three books: the Menaion for the fixed days, the Triodion for the ten weeks
 * before Pascha, and the Pentecostarion for the fifty days after. Almost every
 * Sunday of the two movable books carries the name of its gospel or of what it
 * commemorates — the Publican and the Pharisee, the Myrrh-bearing Women, the
 * Fathers of Nicaea — and, exactly as in the Maronite year, those names are how
 * somebody raised in this church knows where they are.
 */

import type { Lang } from "@/lib/content";
import {
  addDays,
  at,
  daysBetween,
  orthodoxEaster,
  sundayOnOrBefore,
} from "@/lib/liturgy/computus";
import { nthSunday, type RiteYear, type Season, type SundayInfo } from "@/lib/liturgy/types";

const NAME = {
  menaion: { ar: "زمن السنة", en: "The Church Year" },
  triodion: { ar: "زمن التريودي", en: "The Triodion" },
  lent: { ar: "الصوم الأربعيني المقدس", en: "Great Lent" },
  holy: { ar: "الأسبوع العظيم المقدس", en: "Holy Week" },
  pascha: { ar: "زمن الفصح", en: "Paschal Season" },
  pentecost: { ar: "زمن العنصرة", en: "After Pentecost" },
  nativityFast: { ar: "صوم الميلاد", en: "The Nativity Fast" },
};

const OF = {
  pentecost: { ar: "بعد العنصرة", en: "after Pentecost" },
  luke: { ar: "من زمن لوقا", en: "of Luke" },
};

/**
 * The four Sundays of the Triodion that precede the fast, then the six of the
 * fast itself, then Palm Sunday — every one counted back from Pascha, because
 * that is the only date any of them are fixed to.
 */
const MOVABLE_SUNDAYS: Record<number, Record<Lang, string> & { high?: boolean }> = {
  [-70]: { ar: "أحد الفرّيسي والعشّار", en: "Sunday of the Publican and the Pharisee" },
  [-63]: { ar: "أحد الابن الشاطر", en: "Sunday of the Prodigal Son" },
  [-56]: { ar: "أحد مرفع اللحم — الدينونة", en: "Meatfare Sunday · the Last Judgement" },
  [-49]: { ar: "أحد مرفع الجبن — الغفران", en: "Cheesefare Sunday · Forgiveness" },
  [-42]: { ar: "أحد الأرثوذكسية", en: "Sunday of Orthodoxy", high: true },
  [-35]: { ar: "أحد غريغوريوس بالاماس", en: "Sunday of St Gregory Palamas" },
  [-28]: { ar: "أحد السجود للصليب", en: "Sunday of the Veneration of the Cross" },
  [-21]: { ar: "أحد يوحنا السلّمي", en: "Sunday of St John Climacus" },
  [-14]: { ar: "أحد مريم المصرية", en: "Sunday of St Mary of Egypt" },
  [-7]: { ar: "أحد الشعانين", en: "Palm Sunday", high: true },
  [0]: { ar: "أحد الفصح المجيد", en: "Pascha · the Resurrection of the Lord", high: true },
  [7]: { ar: "أحد توما — الأحد الجديد", en: "Thomas Sunday · Antipascha" },
  [14]: { ar: "أحد حاملات الطيب", en: "Sunday of the Myrrh-bearing Women" },
  [21]: { ar: "أحد المخلّع", en: "Sunday of the Paralytic" },
  [28]: { ar: "أحد السامرية", en: "Sunday of the Samaritan Woman" },
  [35]: { ar: "أحد الأعمى", en: "Sunday of the Blind Man" },
  [42]: { ar: "أحد آباء المجمع النيقاوي", en: "Sunday of the Fathers of Nicaea" },
  [49]: { ar: "أحد العنصرة", en: "Pentecost", high: true },
  [56]: { ar: "أحد جميع القدّيسين", en: "Sunday of All Saints" },
};

/** The days either side of Pascha that are not Sundays but outrank one. */
const MOVABLE_DAYS: Record<number, Record<Lang, string>> = {
  [-48]: { ar: "الاثنين النقي — بدء الصوم", en: "Clean Monday · the Great Fast begins" },
  [-8]: { ar: "سبت لعازر", en: "Lazarus Saturday" },
  [-5]: { ar: "الثلاثاء العظيم", en: "Great Tuesday" },
  [-4]: { ar: "الأربعاء العظيم", en: "Great Wednesday" },
  [-3]: { ar: "خميس الأسرار", en: "Great and Holy Thursday" },
  [-2]: { ar: "الجمعة العظيمة", en: "Great and Holy Friday" },
  [-1]: { ar: "سبت النور", en: "Great and Holy Saturday" },
  [39]: { ar: "خميس الصعود", en: "the Ascension of the Lord" },
};

function anchors(y: number) {
  const pascha = orthodoxEaster(y);
  return {
    pascha,
    triodion: addDays(pascha, -70),
    cleanMonday: addDays(pascha, -48),
    palm: addDays(pascha, -7),
    pentecost: addDays(pascha, 49),
    /** The church year opens on the Indiction, not in Advent. */
    indiction: at(y, 8, 1),
    /** Forty days of fasting before the Nativity, from the day after St Philip. */
    nativityFast: at(y, 10, 15),
    christmas: at(y, 11, 25),
  };
}

const weeks = (from: Date, to: Date): number => Math.round(daysBetween(from, to) / 7);

function seasonOf(d: Date, lang: Lang): Season {
  const y = d.getFullYear();
  const a = anchors(y);
  const p = daysBetween(a.pascha, d);

  // The movable books first: where they fall, they override the fixed year.
  if (p >= -70 && p < -48)
    return { id: "triodion", name: NAME.triodion[lang], colour: "violet",
             week: 1 + weeks(a.triodion, sundayOnOrBefore(d)) };
  if (p >= -48 && p < -7)
    return { id: "lent", name: NAME.lent[lang], colour: "violet",
             week: 1 + weeks(a.cleanMonday, sundayOnOrBefore(d)) };
  if (p >= -7 && p < 0)
    return { id: "holy", name: NAME.holy[lang], colour: "red", week: 1 };
  if (p >= 0 && p <= 49)
    return { id: "pascha", name: NAME.pascha[lang], colour: "white",
             week: 1 + weeks(a.pascha, sundayOnOrBefore(d)) };

  // The Nativity Fast is the only other stretch of the fixed year that has a
  // colour of its own; the rest is simply the year going on.
  if (d >= a.nativityFast && d < a.christmas)
    return { id: "nativity-fast", name: NAME.nativityFast[lang], colour: "violet",
             week: 1 + weeks(a.nativityFast, d) };

  if (p > 49)
    return { id: "pentecost", name: NAME.pentecost[lang], colour: "green",
             week: 1 + weeks(a.pentecost, sundayOnOrBefore(d)) };

  // Before this year's Triodion: still counting from *last* year's Pentecost.
  const prev = anchors(y - 1);
  return { id: "pentecost", name: NAME.pentecost[lang], colour: "green",
           week: 1 + weeks(prev.pentecost, sundayOnOrBefore(d)) };
}

function sundayOf(d: Date, lang: Lang): SundayInfo {
  const p = daysBetween(orthodoxEaster(d.getFullYear()), d);
  const named = MOVABLE_SUNDAYS[p];
  if (named) return { title: named[lang], high: Boolean(named.high) };

  const s = seasonOf(d, lang);
  if (s.id === "pentecost") return { title: nthSunday(s.week, OF.pentecost, lang), high: false };

  return { title: lang === "ar" ? "يوم الرب" : "The Lord's Day", high: false };
}

/**
 * The named weekdays of Holy Week and the two Thursdays, for a calendar that
 * would otherwise call Great and Holy Friday "a weekday of the season".
 *
 * Exported rather than folded into `sundayOf` because these are precisely the
 * days that are *not* Sundays and still name themselves.
 */
export function byzantineDayName(d: Date, lang: Lang): string | null {
  const p = daysBetween(orthodoxEaster(d.getFullYear()), d);
  return MOVABLE_DAYS[p]?.[lang] ?? null;
}

export const byzantineYear: RiteYear = { seasonOf, sundayOf };
