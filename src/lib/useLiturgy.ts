"use client";

import { useCallback, useEffect, useState } from "react";

import { writeLocal } from "@/lib/state";
import { RITES, type Rite } from "@/lib/liturgy";

export const LITURGY_KEY = "up_liturgy_v1";

export type LiturgyPrefs = {
  /** Whose calendar the Calendar tab keeps. */
  rite: Rite;
  /** Lay the Latin general calendar under it as a second, labelled layer. */
  alsoRoman: boolean;
};

/**
 * Maronite by default, with the Latin calendar underneath.
 *
 * The app's own content — the Maronite Mass in the coming-soon list, the
 * Arabic throughout — says who is holding the phone. Someone in a Latin parish
 * changes this once; a Maronite never has to.
 */
export const DEFAULT_LITURGY: LiturgyPrefs = {
  rite: "maronite",
  alsoRoman: true,
};

/**
 * Which calendar to keep, held on the device.
 *
 * Deliberately outside `Prefs` and so outside the cloud sync. The prefs table
 * has a column per setting, and adding two would mean a migration run against
 * the live project before the next deploy — with the app writing rows the
 * database would reject in the window between. A calendar choice is not worth
 * that, and it is a one-tap setting on a new phone.
 */
export function useLiturgy() {
  const [prefs, setPrefs] = useState<LiturgyPrefs>(DEFAULT_LITURGY);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LITURGY_KEY);
      if (!raw) return;
      const p = { ...DEFAULT_LITURGY, ...(JSON.parse(raw) as Partial<LiturgyPrefs>) };
      // A build that has since dropped a rite must not leave a device pointing
      // at a calendar with no season module behind it.
      setPrefs(RITES.includes(p.rite) ? p : DEFAULT_LITURGY);
    } catch {
      /* private mode, or a corrupt blob — the default is a fine calendar */
    }
  }, []);

  const patch = useCallback((next: Partial<LiturgyPrefs>) => {
    setPrefs((v) => {
      const merged = { ...v, ...next };
      writeLocal(LITURGY_KEY, merged);
      return merged;
    });
  }, []);

  return {
    ...prefs,
    setRite: useCallback((rite: Rite) => patch({ rite }), [patch]),
    setAlsoRoman: useCallback((alsoRoman: boolean) => patch({ alsoRoman }), [patch]),
  };
}

export type Liturgy = ReturnType<typeof useLiturgy>;
