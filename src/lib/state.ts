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
  /**
   * Sound: the bed under an open prayer, and every reveal, tick and bell the
   * rest of the app makes. One switch, because a person who does not want the
   * app making noise does not want half of it making noise either.
   */
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
  // On, because the sound is part of the thing rather than an extra on top of
  // it, and a first visit with it off is a first visit that never hears any of
  // it. Nothing plays until a tap unlocks the browser's audio anyway, so this
  // cannot make noise at somebody who has not touched the app yet.
  audio: true,
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

/**
 * Marks that this device has already been given the sound once.
 *
 * Sound used to be off unless it was asked for, so every device that ran an
 * older build holds `audio: false` — including the great majority who never
 * opened Settings and were simply handed the old default. Turning it on for
 * them is the point of the change; turning it on again every launch would
 * override somebody who has since gone in and muted it. So it is switched on
 * once per device, and this key is how the app remembers having done it.
 */
const SOUND_DEFAULT_KEY = "up_sound_on_v1";

function soundOnOnce(p: Prefs): Prefs {
  try {
    if (localStorage.getItem(SOUND_DEFAULT_KEY)) return p;
    localStorage.setItem(SOUND_DEFAULT_KEY, "1");
    // Stamped as a change made now, which it is. Without it the account's copy
    // in the database — written before this build and still holding the old
    // default — comes back newer on the next sign-in and switches the sound
    // straight off again. The stamp costs this device's whole settings blob
    // winning that comparison once, which is whole-copy last-write-wins
    // working as designed rather than an exception to it.
    return { ...p, audio: true, updatedAt: Date.now() };
  } catch {
    return p; // private mode — the default in memory is on either way
  }
}

export function readPrefs(): Prefs | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) {
      // No blob at all is still a device that has been handed the sound, and
      // marking it now keeps a later mute from being undone on the launch
      // after it.
      soundOnOnce(DEFAULT_PREFS);
      return null;
    }
    // Spread over the defaults: a blob written by an older build is missing
    // whatever has been added since, and must still load.
    const p = { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
    return soundOnOnce({ ...p, palette: knownPalette(p.palette) });
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
