import design from "@/data/design.json";
import prayers from "@/data/prayers.json";

export type Lang = "ar" | "en";
export type PrayerId = "spirit" | "mary";
export type MysteryKey = "joyful" | "sorrowful" | "glorious" | "luminous";
export type BeadStyle = "arc" | "ring" | "chain" | "orb";
export type Palette =
  | "midnight"
  | "rose"
  | "lavender"
  | "salmon"
  | "sand"
  | "sage";

export type NamedPrayer = { name: string; sections: string[] };
export type Gift = { name: string; super: string };

/** The Holy Spirit chaplet, authored in the design file. */
export type SpiritContent = {
  intro: NamedPrayer[];
  gifts: Gift[];
  beadText: string;
  gloryText: string;
  closing: NamedPrayer[];
};

export type Mystery = {
  name: string;
  fruit?: string;
  offering?: string;
  meditation?: string[];
  /** The Our Father said on the large bead. */
  super: string;
};

export type MysterySet = { offering?: string; mysteries: Mystery[] };

type UIStrings = {
  greeting: string[];
  langSwap: string;
  resumeKicker: string;
  libraryLabel: string;
  comingLabel: string;
  soon: string;
  spiritName: string;
  maryName: string;
  back: string;
  tapHint: string;
  tabs: string[];
  pages: string[];
  coming: string[];
  spiritMeta: string;
  maryMeta: string;
  sheetTitle: string;
  sheetHint: string;
  startPraying: string;
  todayKicker: string;
  todaySetHint: string;
  thisWeek: string;
  days: string[];
  verseLabel: string;
  verse: string;
  verseRef: string;
  statLabels: string[];
  search: string;
  beadStyleLabel: string;
  readingLabel: string;
  textSize: string;
  sizes: string[];
  language: string;
  toggles: [string, string][];
  about: string;
  version: string;
  groups: string[];
};

type Design = {
  AR: SpiritContent;
  EN: SpiritContent;
  HAIL: Record<Lang, string>;
  GLORY: Record<Lang, string>;
  SETS: MysteryKey[];
  SET_LABEL: Record<Lang, Record<MysteryKey, string>>;
  SET_DAYS: Record<Lang, Record<MysteryKey, string>>;
  /** Which mystery set belongs to each weekday, indexed by Date#getDay. */
  DAY_SET: MysteryKey[];
  STYLES: BeadStyle[];
  STYLE_LABEL: Record<Lang, Record<BeadStyle, string>>;
  UI: Record<Lang, UIStrings>;
};

type Prayers = {
  maryPrePrayers: NamedPrayer[];
  maryPrePrayersEn: NamedPrayer[];
  maryPostPrayers: NamedPrayer[];
  maryPostPrayersEn: NamedPrayer[];
  maryMysterySets: Record<MysteryKey, MysterySet>;
  maryMysterySetsEn: Record<MysteryKey, MysterySet>;
};

const D = design as unknown as Design;
const P = prayers as unknown as Prayers;

export const SETS = D.SETS;
export const STYLES = D.STYLES;
export const SET_LABEL = D.SET_LABEL;
export const SET_DAYS = D.SET_DAYS;
export const DAY_SET = D.DAY_SET;
export const STYLE_LABEL = D.STYLE_LABEL;
export const HAIL = D.HAIL;
export const GLORY = D.GLORY;

/**
 * The palettes offered in Settings. `swatch` is the accent and `ground` the
 * darkest background stop, which is all the picker chips need to preview one.
 * `theme` is what goes in the theme-color meta so the browser and task
 * switcher tint to match. Keep these in step with src/app/palettes.css.
 */
export type PaletteInfo = {
  id: Palette;
  label: { ar: string; en: string };
  swatch: string;
  ground: string;
  theme: string;
};

export const PALETTES: PaletteInfo[] = [
  { id: "midnight", label: { ar: "ليلي", en: "Midnight" },
    swatch: "#f0c775", ground: "#0b1226", theme: "#070a15" },
  { id: "rose", label: { ar: "وردي", en: "Rose" },
    swatch: "#f0a8b5", ground: "#22111b", theme: "#140a10" },
  { id: "lavender", label: { ar: "بنفسجي", en: "Lavender" },
    swatch: "#c6b0f6", ground: "#171232", theme: "#0c0a1c" },
  { id: "salmon", label: { ar: "سلموني", en: "Salmon" },
    swatch: "#f5a589", ground: "#24130e", theme: "#150b07" },
  { id: "sand", label: { ar: "رملي", en: "Sand" },
    swatch: "#e8d6b5", ground: "#201d18", theme: "#13110e" },
  { id: "sage", label: { ar: "زيتي", en: "Sage" },
    swatch: "#a9d6ba", ground: "#0f1f1b", theme: "#081210" },
];

export const paletteInfo = (id: Palette): PaletteInfo =>
  PALETTES.find((p) => p.id === id) ?? PALETTES[0];

/** Section heading for the palette picker; not part of the design's strings. */
export const PALETTE_LABEL = { ar: "لون التطبيق", en: "App colour" };

export const ui = (lang: Lang): UIStrings => D.UI[lang];
export const spirit = (lang: Lang): SpiritContent => (lang === "ar" ? D.AR : D.EN);

export const maryPre = (lang: Lang): NamedPrayer[] =>
  lang === "ar" ? P.maryPrePrayers : P.maryPrePrayersEn;
export const maryPost = (lang: Lang): NamedPrayer[] =>
  lang === "ar" ? P.maryPostPrayers : P.maryPostPrayersEn;
export const marySet = (key: MysteryKey, lang: Lang): MysterySet =>
  (lang === "ar" ? P.maryMysterySets : P.maryMysterySetsEn)[key];

/** The mystery set traditionally prayed on a given weekday. */
export const setForDay = (day: number): MysteryKey => DAY_SET[day] ?? "joyful";
