import bundledDesign from "@/data/design.json";
import bundledPrayers from "@/data/prayers.json";

export type Lang = "ar" | "en";
export type PrayerId = "spirit" | "mary";
export type MysteryKey = "joyful" | "sorrowful" | "glorious" | "luminous";
export type BeadStyle = "arc" | "ring" | "chain" | "orb";
export type Palette = "midnight" | "linen" | "ember";

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

/**
 * The daily-devotion surface: two cards on the home screens, and the prompts
 * inside the reader that uncovers a page a tap at a time.
 *
 * `tracks` is indexed the way `DevotionTrack` is ordered in useDevotions —
 * [individual, couples]. It is a pair, not a map, for the same reason `days`
 * and `sizes` are lists: the content document is edited by hand and a flat
 * array is the shape that survives that.
 */
type DevotionStrings = {
  label: string;
  tracks: [string, string];
  /** Under a card nobody has opened yet. */
  reveal: string;
  /** Under one opened and put down part-way. */
  resume: string;
  /** Under one already read today. */
  read: string;
  /** When the day has no page in that book. */
  empty: string;
  /** Under the couples card, before the reader is paired with anyone. */
  locked: string;
  tapVerse: string;
  tapNext: string;
  tapQuote: string;
  tapDone: string;
  doneNote: string;
};

type UIStrings = {
  greeting: string[];
  langSwap: string;
  resumeKicker: string;
  libraryLabel: string;
  spiritName: string;
  maryName: string;
  back: string;
  tapHint: string;
  doneTitle: string;
  doneNote: string;
  tabs: string[];
  pages: string[];
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
  devotion: DevotionStrings;
  statLabels: string[];
  beadStyleLabel: string;
  readingLabel: string;
  textSize: string;
  sizes: string[];
  language: string;
  toggles: [string, string][];
  about: string;
  version: string;
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

const BUNDLED_DESIGN = bundledDesign as unknown as Design;
const BUNDLED_PRAYERS = bundledPrayers as unknown as Prayers;

/* -------------------------------------------------------------------------
 * The live content store.
 *
 * The two JSON files are the shipped copy: they are in the bundle, they are
 * precached by the service worker, and they are what the app runs on before
 * anything is fetched and whenever there is no network. Supabase may replace
 * them at runtime through applyContent(), so the prayer text can be corrected
 * without a redeploy — but it is an override, never a dependency. Nothing
 * below awaits the network.
 *
 * Access goes through functions rather than exported constants precisely so
 * this swap is possible: a `const` captured at import time could never see it.
 * ---------------------------------------------------------------------- */

let D: Design = BUNDLED_DESIGN;
let P: Prayers = BUNDLED_PRAYERS;

let version = 0;
const listeners = new Set<() => void>();

/** Bumped on every swap; React subscribes to it to know to re-render. */
export const contentVersion = (): number => version;

export function subscribeContent(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * A remote document is only adopted if it carries the keys the app will go on
 * to read. This is a shape check, not a schema validation: it is here so that a
 * half-written or truncated row degrades to the bundled text instead of
 * throwing somewhere deep inside the player, mid-prayer.
 */
function looksLikeDesign(v: unknown): v is Design {
  if (!isRecord(v)) return false;
  const keys = ["AR", "EN", "HAIL", "GLORY", "SETS", "SET_LABEL", "SET_DAYS",
                "DAY_SET", "STYLES", "STYLE_LABEL", "UI"];
  if (!keys.every((k) => k in v)) return false;
  return isRecord(v.UI) && isRecord(v.UI.ar) && isRecord(v.UI.en);
}

function looksLikePrayers(v: unknown): v is Prayers {
  if (!isRecord(v)) return false;
  const keys = ["maryPrePrayers", "maryPrePrayersEn", "maryPostPrayers",
                "maryPostPrayersEn", "maryMysterySets", "maryMysterySetsEn"];
  if (!keys.every((k) => k in v)) return false;
  return isRecord(v.maryMysterySets) && "joyful" in v.maryMysterySets;
}

/**
 * Swap in content fetched from Supabase. Documents that fail the shape check
 * are ignored one by one — a bad `prayers` row does not cost you a good
 * `design` one. Returns what was actually adopted.
 */
export function applyContent(docs: {
  design?: unknown;
  prayers?: unknown;
}): { design: boolean; prayers: boolean } {
  const adopted = { design: false, prayers: false };

  if (docs.design !== undefined && looksLikeDesign(docs.design)) {
    D = docs.design;
    adopted.design = true;
  }
  if (docs.prayers !== undefined && looksLikePrayers(docs.prayers)) {
    P = docs.prayers;
    adopted.prayers = true;
  }

  if (adopted.design || adopted.prayers) {
    version += 1;
    listeners.forEach((fn) => fn());
  }
  return adopted;
}

/** Drop any override and go back to the text that shipped in the bundle. */
export function resetContent(): void {
  D = BUNDLED_DESIGN;
  P = BUNDLED_PRAYERS;
  version += 1;
  listeners.forEach((fn) => fn());
}

/** The bundled documents, for seeding the database from what ships today. */
export const bundledContent = () => ({
  design: BUNDLED_DESIGN as unknown,
  prayers: BUNDLED_PRAYERS as unknown,
});

/* ------------------------------- accessors ------------------------------- */

export const sets = (): MysteryKey[] => D.SETS;
export const styles = (): BeadStyle[] => D.STYLES;
export const setLabel = (lang: Lang, key: MysteryKey): string =>
  D.SET_LABEL[lang][key];
export const setDays = (lang: Lang, key: MysteryKey): string =>
  D.SET_DAYS[lang][key];
export const styleLabel = (lang: Lang, style: BeadStyle): string =>
  D.STYLE_LABEL[lang][style];
export const hail = (lang: Lang): string => D.HAIL[lang];
export const glory = (lang: Lang): string => D.GLORY[lang];

/**
 * Remote documents are written by hand and may predate a string the app has
 * since started reading, so the bundled copy fills any gap. Without this a
 * newer build against an older row would render an empty label.
 */
export const ui = (lang: Lang): UIStrings => {
  const base = BUNDLED_DESIGN.UI[lang];
  const live = D.UI[lang];
  return {
    ...base,
    ...live,
    // The one nested object in here, and shallow spread cannot reach inside
    // it: a remote document carrying a `devotion` block written before a
    // prompt was added would otherwise drop that prompt entirely.
    devotion: { ...base.devotion, ...live.devotion },
  };
};
export const spirit = (lang: Lang): SpiritContent => (lang === "ar" ? D.AR : D.EN);

export const maryPre = (lang: Lang): NamedPrayer[] =>
  lang === "ar" ? P.maryPrePrayers : P.maryPrePrayersEn;
export const maryPost = (lang: Lang): NamedPrayer[] =>
  lang === "ar" ? P.maryPostPrayers : P.maryPostPrayersEn;
export const marySet = (key: MysteryKey, lang: Lang): MysterySet =>
  (lang === "ar" ? P.maryMysterySets : P.maryMysterySetsEn)[key];

/** The mystery set traditionally prayed on a given weekday. */
export const setForDay = (day: number): MysteryKey => D.DAY_SET[day] ?? "joyful";

/* -------------------------------- palettes ------------------------------- */

/**
 * The two palettes offered in Settings — one dark, one light. Each is a whole
 * scheme, ground and surface and ink and accent, rather than an accent
 * swapped onto one design.
 *
 * The picker paints each half in its OWN colours rather than the running
 * theme's, so it previews what the tap does. That needs three of these:
 * `ground` is the mid background stop, `swatch` the accent, and `ink` the
 * text colour that is readable on that ground.
 * `theme` is what goes in the theme-color meta so the browser and task
 * switcher tint to match. Keep these in step with src/app/palettes.css.
 *
 * These are not part of the content documents: a palette is a block of CSS
 * custom properties in palettes.css, so a database could name one that does
 * not exist. They stay in the bundle, next to the stylesheet they describe.
 */
export type PaletteInfo = {
  id: Palette;
  label: { ar: string; en: string };
  swatch: string;
  ground: string;
  ink: string;
  theme: string;
};

export const PALETTES: PaletteInfo[] = [
  { id: "midnight", label: { ar: "ليلي", en: "Midnight" },
    swatch: "#e8c77e", ground: "#0b1226", ink: "#eceff7", theme: "#070c18" },
  { id: "linen", label: { ar: "نهاري", en: "Linen" },
    swatch: "#b08445", ground: "#f6f3ec", ink: "#23262e", theme: "#f1ece1" },
  { id: "ember", label: { ar: "جمري", en: "Ember" },
    swatch: "#e8c77e", ground: "#3a0608", ink: "#f7e9e4", theme: "#2a0507" },
];

export const paletteInfo = (id: Palette): PaletteInfo =>
  PALETTES.find((p) => p.id === id) ?? PALETTES[0];

/** Section heading for the palette picker; not part of the design's strings. */
export const PALETTE_LABEL = { ar: "لون التطبيق", en: "App colour" };
