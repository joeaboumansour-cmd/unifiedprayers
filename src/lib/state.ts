import { PALETTES } from "@/lib/content";
import type { BeadStyle, Lang, MysteryKey, Palette, PrayerId } from "@/lib/content";
import type { PrefsRow, ProgressRow } from "@/lib/supabase/types";

export const PREFS_KEY = "up_prefs_v1";
export const PROGRESS_KEY = "up_progress_v1";

/** After a day away it is a new prayer, not a resumed one. */
export const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;

export type Prefs = {
  lang: Lang;
  beadStyle: BeadStyle;
  palette: Palette;
  size: number;
  dim: boolean;
  audio: boolean;
  awake: boolean;
  /**
   * When these prefs were last changed on a device, epoch ms. Never shown; it
   * exists so that signing in on a second device can tell which copy is newer.
   * Blobs written before sync existed have no value here and count as oldest.
   */
  updatedAt: number;
};

export type Progress = {
  prayer: PrayerId;
  mysterySet: MysteryKey;
  spiritStep: number;
  maryStep: number;
  at: number;
};

export const DEFAULT_PREFS: Prefs = {
  lang: "ar",
  beadStyle: "arc",
  palette: "midnight",
  size: 1,
  dim: false,
  audio: false,
  awake: true,
  updatedAt: 0,
};

/* ------------------------------- local disk ------------------------------ */

/**
 * A palette the build still ships, or the default. A device that last ran an
 * older build holds a name that has since been dropped; leaving it in place
 * would paint as midnight anyway, because the CSS is gone, and would then be
 * pushed to a database that rejects it.
 */
const knownPalette = (p: Palette): Palette =>
  PALETTES.some((x) => x.id === p) ? p : DEFAULT_PREFS.palette;

export function readPrefs(): Prefs | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    // Spread over the defaults: a blob written by an older build is missing
    // whatever has been added since, and must still load.
    const p = { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
    return { ...p, palette: knownPalette(p.palette) };
  } catch {
    return null; // private mode, or a corrupt blob — defaults are fine
  }
}

export function readProgress(): Progress | null {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as Progress) : null;
  } catch {
    return null; // a corrupt snapshot must never stop the app opening
  }
}

export function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode, or the quota is full — the app works without persistence */
  }
}

/** Whether a snapshot is still recent enough to resume into. */
export const isFresh = (p: Progress): boolean =>
  Date.now() - p.at < RESUME_WINDOW_MS;

/* --------------------------- local <-> database -------------------------- */

export const prefsToRow = (p: Prefs, userId: string): PrefsRow => ({
  user_id: userId,
  lang: p.lang,
  bead_style: p.beadStyle,
  palette: p.palette,
  size: p.size,
  dim: p.dim,
  audio: p.audio,
  awake: p.awake,
  updated_at: new Date(p.updatedAt || Date.now()).toISOString(),
});

export const rowToPrefs = (r: PrefsRow): Prefs => ({
  lang: r.lang,
  beadStyle: r.bead_style,
  palette: knownPalette(r.palette),
  size: r.size,
  dim: r.dim,
  audio: r.audio,
  awake: r.awake,
  updatedAt: Date.parse(r.updated_at),
});

export const progressToRow = (p: Progress, userId: string): ProgressRow => ({
  user_id: userId,
  prayer: p.prayer,
  mystery_set: p.mysterySet,
  spirit_step: p.spiritStep,
  mary_step: p.maryStep,
  at: new Date(p.at).toISOString(),
  updated_at: new Date(p.at).toISOString(),
});

export const rowToProgress = (r: ProgressRow): Progress => ({
  prayer: r.prayer,
  mysterySet: r.mystery_set,
  spiritStep: r.spirit_step,
  maryStep: r.mary_step,
  at: Date.parse(r.at),
});
