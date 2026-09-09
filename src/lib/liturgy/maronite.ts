/**
 * The Maronite liturgical year.
 *
 * Not a translated Roman calendar. The year opens in November with the
 * Consecration of the Church rather than with Advent, Lent begins on the
 * Sunday of the Wedding at Cana rather than on Ash Wednesday, and most Sundays
 * carry the name of the gospel read that day — the Leper, the Prodigal Son,
 * the Blind Man — instead of a number. Those names are the season: someone who
 * grew up in this church navigates the year by them, so they are what the
 * calendar shows.
 *
 * The Season of the Announcements is built the way the books construct it:
 * seven Sundays, the last of which — the Revelation to Joseph — is the Sunday
 * before Christmas. Counting back from a fixed date rather than forward from a
 * rule about the nearest Sunday to 1 November keeps the seven in step with
 * Christmas in every year.
 */

import type { Lang } from "@/lib/content";
import {
  addDays,
  at,
  daysBetween,
  sundayBefore,
  sundayOnOrBefore,
  easter,
} from "@/lib/liturgy/computus";
import { nthSunday, type RiteYear, type Season, type SundayInfo } from "@/lib/liturgy/types";

const NAME = {
  announce: { ar: "زمن البشارات", en: "Season of the Announcements" },
  birth: { ar: "زمن الميلاد المجيد", en: "Season of the Glorious Birth" },
  epiphany: { ar: "زمن الدنح المجيد", en: "Season of the Glorious Epiphany" },
  lent: { ar: "زمن الصوم الكبير", en: "Great Lent" },
  passion: { ar: "أسبوع الآلام", en: "Passion Week" },
  resurrection: { ar: "زمن القيامة المجيدة", en: "Season of the Glorious Resurrection" },
  pentecost: { ar: "زمن العنصرة", en: "Season of Pentecost" },
  cross: { ar: "زمن الصليب", en: "Season of the Holy Cross" },
};

const OF = {
  epiphany: { ar: "من زمن الدنح", en: "after the Glorious Epiphany" },
  resurrection: { ar: "من زمن القيامة", en: "of the Resurrection" },
  pentecost: { ar: "من زمن العنصرة", en: "of Pentecost" },
  cross: { ar: "من زمن الصليب", en: "of the Holy Cross" },
};

/** The seven Sundays of the Announcements, in the order they are kept. */
const ANNOUNCEMENTS: Record<Lang, string>[] = [
  { ar: "أحد تقديس البيعة", en: "Consecration of the Church" },
  { ar: "أحد تجديد البيعة", en: "Renewal of the Church" },
  { ar: "أحد بشارة زكريا", en: "Announcement to Zechariah" },
  { ar: "أحد بشارة مريم العذراء", en: "Announcement to the Virgin Mary" },
  { ar: "أحد زيارة مريم لأليصابات", en: "Visitation of Mary to Elizabeth" },
  { ar: "أحد مولد يوحنا المعمدان", en: "Birth of John the Baptist" },
  { ar: "أحد بشارة يوسف", en: "Revelation to Joseph" },
];

/** The six Sundays of Great Lent, then Hosanna. Named for the day's gospel. */
const LENT: Record<Lang, string>[] = [
  { ar: "أحد عرس قانا الجليل", en: "Cana Sunday" },
  { ar: "أحد شفاء الأبرص", en: "Sunday of the Leper" },
  { ar: "أحد شفاء النازفة", en: "Sunday of the Hemorrhaging Woman" },
  { ar: "أحد الابن الشاطر", en: "Sunday of the Prodigal Son" },
  { ar: "أحد شفاء المخلّع", en: "Sunday of the Paralytic" },
  { ar: "أحد شفاء الأعمى", en: "Sunday of the Blind Man" },
  { ar: "أحد الشعانين", en: "Hosanna Sunday" },
];

/** The three commemorations that close the Epiphany season, in order. */
const BEFORE_LENT: Record<Lang, string>[] = [
  { ar: "أحد الكهنة", en: "Sunday of the Priests" },
  { ar: "أحد الأبرار والصدّيقين", en: "Sunday of the Righteous and the Just" },
  { ar: "أحد الموتى المؤمنين", en: "Sunday of the Faithful Departed" },
];

function anchors(y: number) {
  const east = easter(y);
  /** The Sunday before Christmas closes the Announcements; the other six
      Sundays are simply the six before it. */
  const joseph = sundayBefore(at(y, 11, 25));
  return {
    east,
    /** Great Lent opens on Cana Sunday, seven weeks before Easter. */
    cana: addDays(east, -49),
    hosanna: addDays(east, -7),
    pentecost: addDays(east, 49),
    joseph,
    announce1: addDays(joseph, -42),
    christmas: at(y, 11, 25),
    epiphany: at(y, 0, 6),
    /** The Exaltation of the Cross opens the last season of the year. */
    cross: at(y, 8, 14),
  };
}

const weeks = (from: Date, to: Date): number =>
  Math.round(daysBetween(from, to) / 7);

function seasonOf(d: Date, lang: Lang): Season {
  const y = d.getFullYear();
  const a = anchors(y);

  if (d >= a.christmas)
    return { id: "birth", name: NAME.birth[lang], colour: "white",
             week: 1 + weeks(a.christmas, d) };
  if (d >= a.announce1)
    return { id: "announce", name: NAME.announce[lang], colour: "violet",
             week: 1 + weeks(a.announce1, sundayOnOrBefore(d)) };
  if (d >= a.cross)
    return { id: "cross", name: NAME.cross[lang], colour: "red",
             week: 1 + weeks(a.cross, d) };
  // The first five days of January still belong to the Birth, which opened on
  // 25 December of the year before.
  if (d < a.epiphany)
    return { id: "birth", name: NAME.birth[lang], colour: "white",
             week: 1 + weeks(at(y - 1, 11, 25), d) };
  if (d < a.cana)
    return { id: "epiphany", name: NAME.epiphany[lang], colour: "white",
             week: 1 + weeks(a.epiphany, d) };
  if (d < a.hosanna)
    return { id: "lent", name: NAME.lent[lang], colour: "violet",
             week: 1 + weeks(a.cana, sundayOnOrBefore(d)) };
  if (d < a.east)
    return { id: "passion", name: NAME.passion[lang], colour: "red", week: 1 };
  if (d <= a.pentecost)
    return { id: "resurrection", name: NAME.resurrection[lang], colour: "white",
             week: 1 + weeks(a.east, sundayOnOrBefore(d)) };
  return { id: "pentecost", name: NAME.pentecost[lang], colour: "green",
           week: 1 + weeks(a.pentecost, sundayOnOrBefore(d)) };
}

function sundayOf(d: Date, lang: Lang): SundayInfo {
  const ar = lang === "ar";
  const a = anchors(d.getFullYear());
  const sinceEaster = daysBetween(a.east, d);

  if (sinceEaster === 0)
    return { title: ar ? "أحد القيامة المجيد" : "Sunday of the Glorious Resurrection", high: true };
  if (sinceEaster === 7)
    return { title: ar ? "الأحد الجديد" : "New Sunday", high: false };
  if (sinceEaster === 49)
    return { title: ar ? "أحد العنصرة" : "Pentecost Sunday", high: true };

  /* Great Lent: seven named Sundays, Cana through Hosanna. */
  const lentIndex = Math.round(daysBetween(a.cana, d) / 7);
  if (daysBetween(a.cana, d) % 7 === 0 && lentIndex >= 0 && lentIndex < LENT.length)
    return { title: LENT[lentIndex][lang], high: lentIndex === 0 || lentIndex === 6 };

  /* The three commemorations immediately before Cana. */
  const beforeLent = Math.round(daysBetween(d, a.cana) / 7);
  if (beforeLent >= 1 && beforeLent <= 3)
    return { title: BEFORE_LENT[3 - beforeLent][lang], high: false };

  /* The Announcements, counted forward from the Consecration of the Church. */
  const announceIndex = Math.round(daysBetween(a.announce1, d) / 7);
  if (d >= a.announce1 && d < a.christmas && announceIndex < ANNOUNCEMENTS.length)
    return { title: ANNOUNCEMENTS[announceIndex][lang], high: announceIndex === 0 };

  /* Any Sunday between Christmas and the Epiphany. */
  const md = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (md >= "12-26" || md <= "01-05")
    return {
      title: ar ? "أحد وجدان الصبي يسوع في الهيكل" : "Finding of the Child Jesus in the Temple",
      high: false,
    };

  const s = seasonOf(d, lang);
  if (s.id === "epiphany") return { title: nthSunday(s.week, OF.epiphany, lang), high: false };
  if (s.id === "resurrection") return { title: nthSunday(s.week, OF.resurrection, lang), high: false };
  if (s.id === "pentecost") return { title: nthSunday(s.week, OF.pentecost, lang), high: false };
  if (s.id === "cross") return { title: nthSunday(s.week, OF.cross, lang), high: false };

  return { title: ar ? "أحد الرب" : "The Lord's Day", high: false };
}

export const maroniteYear: RiteYear = { seasonOf, sundayOf };
