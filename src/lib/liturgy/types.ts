import type { Lang } from "@/lib/content";

/**
 * The churches the calendar keeps. Adding another is a season module and a
 * `rites` tag in the feast table — nothing in the UI has to change.
 */
export type Rite =
  | "maronite"
  | "roman"
  | "byzantine"
  | "coptic"
  | "armenian"
  | "syriac"
  | "melkite"
  | "coptic-catholic"
  | "syriac-catholic";

export const RITES: Rite[] = [
  "maronite",
  "roman",
  "melkite",
  "byzantine",
  "syriac",
  "syriac-catholic",
  "coptic",
  "coptic-catholic",
  "armenian",
];

export const RITE_LABEL: Record<Rite, Record<Lang, string>> = {
  maronite: { ar: "الكنيسة المارونية", en: "Maronite" },
  roman: { ar: "الكنيسة اللاتينية", en: "Roman Catholic" },
  byzantine: { ar: "الكنيسة الأرثوذكسية", en: "Orthodox" },
  coptic: { ar: "الكنيسة القبطية", en: "Coptic Orthodox" },
  armenian: { ar: "الكنيسة الأرمنية", en: "Armenian Apostolic" },
  syriac: { ar: "الكنيسة السريانية الأرثوذكسية", en: "Syriac Orthodox" },
  melkite: { ar: "الروم الملكيّون الكاثوليك", en: "Melkite Greek Catholic" },
  "coptic-catholic": { ar: "الكنيسة القبطية الكاثوليكية", en: "Coptic Catholic" },
  "syriac-catholic": { ar: "الكنيسة السريانية الكاثوليكية", en: "Syriac Catholic" },
};

export const RITE_HINT: Record<Rite, Record<Lang, string>> = {
  maronite: {
    ar: "السنة الطقسية الأنطاكية السريانية",
    en: "The Syriac-Antiochene liturgical year",
  },
  roman: {
    ar: "الروزنامة اللاتينية العامة",
    en: "The Latin general calendar",
  },
  byzantine: {
    // Fixed feasts on the ordinary calendar, Pascha on the older reckoning —
    // which is the Antiochian and Greek practice, and the one a reader in
    // Lebanon is most likely to be keeping.
    ar: "السنة الطقسية البيزنطية — الفصح بالحساب القديم",
    en: "The Byzantine year, with Pascha on the older reckoning",
  },
  coptic: {
    // Its feasts are not on the ordinary calendar at all — they are on the
    // Coptic one, and the app converts.
    ar: "التقويم القبطي — تقويم الشهداء",
    en: "The Coptic calendar, the Era of the Martyrs",
  },
  armenian: {
    // The one church that never split the Nativity from the Baptism.
    ar: "التقويم الأرمني — الميلاد والغطاس معًا",
    en: "The Armenian year, Nativity and Theophany together",
  },
  syriac: {
    ar: "الكنيسة السريانية الأنطاكية — الفصح بالحساب القديم",
    en: "The West Syriac year, with Pascha on the older reckoning",
  },
  // The three Eastern Catholic churches keep the year of their Orthodox
  // counterparts — same seasons, same Pascha — and differ in communion, which
  // a calendar cannot show. The hint is where that is said plainly.
  melkite: {
    ar: "السنة البيزنطية بالعربية — بشركة مع روما",
    en: "The Byzantine year, in communion with Rome",
  },
  "coptic-catholic": {
    ar: "التقويم القبطي — بشركة مع روما",
    en: "The Coptic calendar, in communion with Rome",
  },
  "syriac-catholic": {
    ar: "السنة السريانية الغربية — بشركة مع روما",
    en: "The West Syriac year, in communion with Rome",
  },
};

/**
 * How much of the day a celebration takes over. The order matters: it is what
 * decides which name a day is filed under when more than one falls together.
 */
export type Rank = "solemnity" | "feast" | "memorial" | "commemoration";

export const RANK_WEIGHT: Record<Rank, number> = {
  solemnity: 3,
  feast: 2,
  memorial: 1,
  commemoration: 0,
};

export const RANK_LABEL: Record<Rank, Record<Lang, string>> = {
  solemnity: { ar: "عيد سيّدي", en: "Solemnity" },
  feast: { ar: "عيد", en: "Feast" },
  memorial: { ar: "تذكار", en: "Memorial" },
  commemoration: { ar: "تذكار اختياري", en: "Optional memorial" },
};

/**
 * The vestment colour of the day. It is the calendar's own encoding, which is
 * why the grid uses it for the dots rather than inventing a key of its own:
 * anyone who has been to Mass already reads it.
 */
export type LitColour = "white" | "red" | "green" | "violet" | "rose";

export const COLOUR_LABEL: Record<LitColour, Record<Lang, string>> = {
  white: { ar: "أبيض", en: "White" },
  red: { ar: "أحمر", en: "Red" },
  green: { ar: "أخضر", en: "Green" },
  violet: { ar: "بنفسجي", en: "Violet" },
  rose: { ar: "وردي", en: "Rose" },
};

/** The CSS variable each colour resolves to. Defined in palettes.css. */
export const colourVar = (c: LitColour): string => `var(--lit-${c})`;

/** A stretch of the year, already resolved against a particular date. */
export type Season = {
  id: string;
  name: string;
  colour: LitColour;
  /** Which week of the season the day falls in, counted from 1. */
  week: number;
};

/** A Sunday's proper name, and whether it outranks whatever else falls that day. */
export type SundayInfo = {
  title: string;
  /** Easter, Christmas, Pentecost — days the grid sets in gold. */
  high: boolean;
};

/**
 * One rite's year. Both modules export exactly this, so `index.ts` never has
 * to know which church it is looking at.
 */
export type RiteYear = {
  seasonOf: (d: Date, lang: Lang) => Season;
  sundayOf: (d: Date, lang: Lang) => SundayInfo;
};

/* --------------------------------- ordinals -------------------------------- */

/**
 * Written out rather than generated. Arabic ordinals compound irregularly —
 * الحادي والعشرون, not الواحد والعشرون — and a generator that got one wrong
 * would put it on the screen every week for a year without anyone able to
 * point at the line that caused it. Thirty-four is as far as any season counts.
 */
const EN_ORDINAL = [
  "", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh",
  "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth", "Thirteenth",
  "Fourteenth", "Fifteenth", "Sixteenth", "Seventeenth", "Eighteenth",
  "Nineteenth", "Twentieth", "Twenty-First", "Twenty-Second", "Twenty-Third",
  "Twenty-Fourth", "Twenty-Fifth", "Twenty-Sixth", "Twenty-Seventh",
  "Twenty-Eighth", "Twenty-Ninth", "Thirtieth", "Thirty-First",
  "Thirty-Second", "Thirty-Third", "Thirty-Fourth",
];

const AR_ORDINAL = [
  "", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع",
  "الثامن", "التاسع", "العاشر", "الحادي عشر", "الثاني عشر", "الثالث عشر",
  "الرابع عشر", "الخامس عشر", "السادس عشر", "السابع عشر", "الثامن عشر",
  "التاسع عشر", "العشرون", "الحادي والعشرون", "الثاني والعشرون",
  "الثالث والعشرون", "الرابع والعشرون", "الخامس والعشرون", "السادس والعشرون",
  "السابع والعشرون", "الثامن والعشرون", "التاسع والعشرون", "الثلاثون",
  "الحادي والثلاثون", "الثاني والثلاثون", "الثالث والثلاثون",
  "الرابع والثلاثون",
];

export const ordinal = (n: number, lang: Lang): string =>
  (lang === "ar" ? AR_ORDINAL : EN_ORDINAL)[n] ?? String(n);

/**
 * "Third Sunday of Advent" / "الأحد الثالث من زمن المجيء".
 *
 * Arabic puts the ordinal after the noun and needs the linking من, so the two
 * languages cannot share one template — which is exactly why this is a
 * function and not a `${}` at each of the fifteen call sites.
 */
export const nthSunday = (n: number, of: Record<Lang, string>, lang: Lang): string =>
  lang === "ar"
    ? `الأحد ${ordinal(n, "ar")} ${of.ar}`
    : `${ordinal(n, "en")} Sunday ${of.en}`;
