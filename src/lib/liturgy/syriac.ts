/**
 * The Syriac Orthodox year — the West Syriac tradition of Antioch.
 *
 * The nearest neighbour of the Maronite calendar in this app, and for a good
 * reason: they are the same rite. Both descend from the liturgy of Antioch,
 * both pray the Anaphora of St James, both open the year with the Consecration
 * of the Church in the autumn rather than with Advent, and both count the weeks
 * before Christmas as the Announcements.
 *
 * What separates them is Pascha. The Maronite church, in communion with Rome,
 * moved to the Gregorian reckoning; the Syriac Orthodox kept the older one. So
 * these two calendars agree about the shape of the year and then, most years,
 * disagree about when the middle of it happens — which is the whole history of
 * the two churches in one arithmetic difference.
 *
 * The season module is therefore built like the Maronite one and anchored to
 * Pascha instead of Easter.
 */

import type { Lang } from "@/lib/content";
import {
  addDays,
  at,
  daysBetween,
  orthodoxEaster,
  sundayBefore,
  sundayOnOrBefore,
} from "@/lib/liturgy/computus";
import { nthSunday, type RiteYear, type Season, type SundayInfo } from "@/lib/liturgy/types";

const NAME = {
  announce: { ar: "زمن البشارات", en: "Season of the Announcements" },
  birth: { ar: "زمن الميلاد", en: "Season of the Nativity" },
  epiphany: { ar: "زمن الدنح", en: "Season of the Epiphany" },
  lent: { ar: "الصوم الكبير", en: "The Great Fast" },
  passion: { ar: "أسبوع الآلام", en: "Passion Week" },
  resurrection: { ar: "زمن القيامة", en: "Season of the Resurrection" },
  pentecost: { ar: "زمن العنصرة", en: "Season of Pentecost" },
  cross: { ar: "زمن الصليب", en: "Season of the Holy Cross" },
};

const OF = {
  epiphany: { ar: "من زمن الدنح", en: "after the Epiphany" },
  resurrection: { ar: "من زمن القيامة", en: "of the Resurrection" },
  pentecost: { ar: "من زمن العنصرة", en: "of Pentecost" },
  cross: { ar: "من زمن الصليب", en: "of the Holy Cross" },
};

/** The Sundays of the Great Fast, named for the day's gospel. */
const LENT: Record<Lang, string>[] = [
  { ar: "أحد عرس قانا الجليل", en: "Cana Sunday" },
  { ar: "أحد شفاء الأبرص", en: "Sunday of the Leper" },
  { ar: "أحد شفاء النازفة", en: "Sunday of the Hemorrhaging Woman" },
  { ar: "أحد الابن الشاطر", en: "Sunday of the Prodigal Son" },
  { ar: "أحد شفاء المخلّع", en: "Sunday of the Paralytic" },
  { ar: "أحد شفاء الأعمى", en: "Sunday of the Blind Man" },
  { ar: "أحد الشعانين", en: "Hosanna Sunday" },
];

const ANNOUNCEMENTS: Record<Lang, string>[] = [
  { ar: "أحد تقديس البيعة", en: "Consecration of the Church" },
  { ar: "أحد تجديد البيعة", en: "Renewal of the Church" },
  { ar: "أحد بشارة زكريا", en: "Announcement to Zechariah" },
  { ar: "أحد بشارة والدة الله", en: "Announcement to the Mother of God" },
  { ar: "أحد زيارة مريم لأليصابات", en: "Visitation of Mary to Elizabeth" },
  { ar: "أحد مولد يوحنا المعمدان", en: "Birth of John the Baptist" },
  { ar: "أحد بشارة يوسف", en: "Revelation to Joseph" },
];

function anchors(y: number) {
  const pascha = orthodoxEaster(y);
  const joseph = sundayBefore(at(y, 11, 25));
  return {
    pascha,
    cana: addDays(pascha, -49),
    hosanna: addDays(pascha, -7),
    pentecost: addDays(pascha, 49),
    joseph,
    announce1: addDays(joseph, -42),
    christmas: at(y, 11, 25),
    epiphany: at(y, 0, 6),
    cross: at(y, 8, 14),
  };
}

const weeks = (from: Date, to: Date): number => Math.round(daysBetween(from, to) / 7);

function seasonOf(d: Date, lang: Lang): Season {
  const y = d.getFullYear();
  const a = anchors(y);

  if (d >= a.christmas)
    return { id: "birth", name: NAME.birth[lang], colour: "white", week: 1 + weeks(a.christmas, d) };
  if (d >= a.announce1)
    return { id: "announce", name: NAME.announce[lang], colour: "violet",
             week: 1 + weeks(a.announce1, sundayOnOrBefore(d)) };
  if (d >= a.cross)
    return { id: "cross", name: NAME.cross[lang], colour: "red", week: 1 + weeks(a.cross, d) };
  if (d < a.epiphany)
    return { id: "birth", name: NAME.birth[lang], colour: "white",
             week: 1 + weeks(at(y - 1, 11, 25), d) };
  if (d < a.cana)
    return { id: "epiphany", name: NAME.epiphany[lang], colour: "white",
             week: 1 + weeks(a.epiphany, d) };
  if (d < a.hosanna)
    return { id: "lent", name: NAME.lent[lang], colour: "violet",
             week: 1 + weeks(a.cana, sundayOnOrBefore(d)) };
  if (d < a.pascha)
    return { id: "passion", name: NAME.passion[lang], colour: "red", week: 1 };
  if (d <= a.pentecost)
    return { id: "resurrection", name: NAME.resurrection[lang], colour: "white",
             week: 1 + weeks(a.pascha, sundayOnOrBefore(d)) };
  return { id: "pentecost", name: NAME.pentecost[lang], colour: "green",
           week: 1 + weeks(a.pentecost, sundayOnOrBefore(d)) };
}

function sundayOf(d: Date, lang: Lang): SundayInfo {
  const ar = lang === "ar";
  const a = anchors(d.getFullYear());
  const p = daysBetween(a.pascha, d);

  if (p === 0) return { title: ar ? "أحد القيامة المجيد" : "Sunday of the Resurrection", high: true };
  if (p === 7) return { title: ar ? "الأحد الجديد" : "New Sunday", high: false };
  if (p === 49) return { title: ar ? "أحد العنصرة" : "Pentecost", high: true };

  const lentIndex = Math.round(daysBetween(a.cana, d) / 7);
  if (daysBetween(a.cana, d) % 7 === 0 && lentIndex >= 0 && lentIndex < LENT.length)
    return { title: LENT[lentIndex][lang], high: lentIndex === 0 || lentIndex === 6 };

  const announceIndex = Math.round(daysBetween(a.announce1, d) / 7);
  if (d >= a.announce1 && d < a.christmas && announceIndex < ANNOUNCEMENTS.length)
    return { title: ANNOUNCEMENTS[announceIndex][lang], high: announceIndex === 0 };

  const s = seasonOf(d, lang);
  if (s.id === "epiphany") return { title: nthSunday(s.week, OF.epiphany, lang), high: false };
  if (s.id === "resurrection") return { title: nthSunday(s.week, OF.resurrection, lang), high: false };
  if (s.id === "pentecost") return { title: nthSunday(s.week, OF.pentecost, lang), high: false };
  if (s.id === "cross") return { title: nthSunday(s.week, OF.cross, lang), high: false };
  return { title: ar ? "أحد الرب" : "The Lord's Day", high: false };
}

export const syriacYear: RiteYear = { seasonOf, sundayOf };
