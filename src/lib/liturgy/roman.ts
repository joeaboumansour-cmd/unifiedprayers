/**
 * The Roman (Latin) liturgical year.
 *
 * Six seasons and one awkward detail: Ordinary Time is in two halves that
 * share a single run of week numbers, so the second half has to be counted
 * *backwards* from Christ the King. Everything else falls straight out of
 * Easter and Christmas.
 *
 * Epiphany is kept on 6 January rather than moved to the nearest Sunday. The
 * transfer is a decision each bishops' conference makes for its own country,
 * and this app has no country — a reader in Beirut and a reader in Sydney get
 * the same document. When national calendars are added, that choice belongs
 * beside the country, not here.
 */

import type { Lang } from "@/lib/content";
import {
  addDays,
  at,
  daysBetween,
  sameDay,
  sundayAfter,
  sundayBefore,
  sundayOnOrBefore,
  easter,
} from "@/lib/liturgy/computus";
import { nthSunday, type RiteYear, type Season, type SundayInfo } from "@/lib/liturgy/types";

const NAME = {
  advent: { ar: "زمن المجيء", en: "Advent" },
  christmas: { ar: "زمن الميلاد", en: "Christmas" },
  ordinary: { ar: "الزمن العادي", en: "Ordinary Time" },
  lent: { ar: "زمن الصوم الكبير", en: "Lent" },
  triduum: { ar: "الثلاثية الفصحية", en: "The Sacred Triduum" },
  easter: { ar: "زمن الفصح", en: "Eastertide" },
};

/** The linking phrase a numbered Sunday hangs off, per season. */
const OF = {
  advent: { ar: "من زمن المجيء", en: "of Advent" },
  ordinary: { ar: "من الزمن العادي", en: "in Ordinary Time" },
  lent: { ar: "من زمن الصوم الكبير", en: "of Lent" },
  easter: { ar: "من زمن الفصح", en: "of Easter" },
};

/** The fixed points of one calendar year, worked out once per lookup. */
function anchors(y: number) {
  const east = easter(y);
  return {
    east,
    ash: addDays(east, -46),
    holyThursday: addDays(east, -3),
    pentecost: addDays(east, 49),
    /** Advent opens four Sundays before Christmas. */
    advent1: addDays(sundayBefore(at(y, 11, 25)), -21),
    christmas: at(y, 11, 25),
    /** Ends Christmas Time; the weeks of Ordinary Time count from here. */
    baptism: sundayAfter(at(y, 0, 6)),
    /** The last Sunday of the year, and by definition week 34. */
    christKing: addDays(addDays(sundayBefore(at(y, 11, 25)), -21), -7),
  };
}

/** Weeks between two Sundays, as a count of whole weeks. */
const weeks = (from: Date, to: Date): number =>
  Math.round(daysBetween(from, to) / 7);

/**
 * Which week of Ordinary Time a day falls in.
 *
 * The first half counts forward from the Baptism of the Lord, which is itself
 * week 1. The second half has to be pinned to the far end instead: the number
 * of Sundays between Pentecost and Advent changes with the date of Easter, so
 * the only stable anchor is Christ the King at week 34, counted backwards.
 */
function ordinaryWeek(d: Date, a: ReturnType<typeof anchors>): number {
  const sunday = sundayOnOrBefore(d);
  if (d < a.ash) return 1 + weeks(a.baptism, sunday);
  return 34 - weeks(sunday, a.christKing);
}

function seasonOf(d: Date, lang: Lang): Season {
  const a = anchors(d.getFullYear());

  if (d >= a.christmas) {
    return { id: "christmas", name: NAME.christmas[lang], colour: "white",
             week: 1 + weeks(a.christmas, d) };
  }
  if (d >= a.advent1) {
    return { id: "advent", name: NAME.advent[lang], colour: "violet",
             week: 1 + weeks(a.advent1, sundayOnOrBefore(d)) };
  }
  // January up to the Baptism is still Christmas — it belongs to the season
  // that opened on 25 December of the year before.
  if (d <= a.baptism) {
    return { id: "christmas", name: NAME.christmas[lang], colour: "white",
             week: 1 + weeks(at(d.getFullYear() - 1, 11, 25), d) };
  }
  if (d < a.ash) {
    return { id: "ordinary", name: NAME.ordinary[lang], colour: "green",
             week: ordinaryWeek(d, a) };
  }
  if (d < a.holyThursday) {
    return { id: "lent", name: NAME.lent[lang], colour: "violet",
             week: 1 + weeks(addDays(a.ash, 4), sundayOnOrBefore(d)) };
  }
  if (d < a.east) {
    return { id: "triduum", name: NAME.triduum[lang], colour: "red", week: 1 };
  }
  if (d <= a.pentecost) {
    return { id: "easter", name: NAME.easter[lang], colour: "white",
             week: 1 + weeks(a.east, sundayOnOrBefore(d)) };
  }
  return { id: "ordinary", name: NAME.ordinary[lang], colour: "green",
           week: ordinaryWeek(d, a) };
}

function sundayOf(d: Date, lang: Lang): SundayInfo {
  const ar = lang === "ar";
  const a = anchors(d.getFullYear());
  const sinceEaster = daysBetween(a.east, d);

  /* Easter and the Sundays that hang off it, in the order they fall. */
  if (sinceEaster === -7)
    return { title: ar ? "أحد الشعانين" : "Palm Sunday of the Passion of the Lord", high: true };
  if (sinceEaster === 0)
    return { title: ar ? "أحد القيامة المجيد" : "Easter Sunday of the Resurrection", high: true };
  if (sinceEaster === 7)
    return { title: ar ? "أحد الرحمة الإلهية" : "Second Sunday of Easter · Divine Mercy", high: false };
  if (sinceEaster === 49)
    return { title: ar ? "أحد العنصرة" : "Pentecost Sunday", high: true };
  if (sinceEaster === 56)
    return { title: ar ? "أحد الثالوث الأقدس" : "The Most Holy Trinity", high: true };

  if (sameDay(d, a.christKing))
    return { title: ar ? "أحد يسوع المسيح ملك الكون" : "Our Lord Jesus Christ, King of the Universe", high: true };
  if (sameDay(d, a.baptism))
    return { title: ar ? "أحد عماد الرب" : "The Baptism of the Lord", high: true };

  /* The Sunday inside the Christmas octave, and the one that follows it. */
  const md = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (md >= "12-26" && md <= "12-31")
    return { title: ar ? "أحد العائلة المقدسة" : "The Holy Family of Jesus, Mary and Joseph", high: true };
  if (md >= "01-02" && md <= "01-05")
    return { title: ar ? "الأحد الثاني بعد الميلاد" : "Second Sunday after the Nativity", high: false };

  const s = seasonOf(d, lang);
  if (s.id === "advent") return { title: nthSunday(s.week, OF.advent, lang), high: false };
  if (s.id === "lent") return { title: nthSunday(s.week, OF.lent, lang), high: false };
  if (s.id === "easter") return { title: nthSunday(s.week, OF.easter, lang), high: false };
  if (s.id === "ordinary") return { title: nthSunday(s.week, OF.ordinary, lang), high: false };

  return { title: ar ? "أحد الرب" : "The Lord's Day", high: false };
}

export const romanYear: RiteYear = { seasonOf, sundayOf };
