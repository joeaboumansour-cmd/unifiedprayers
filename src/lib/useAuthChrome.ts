"use client";

import { useEffect, useState } from "react";

import { type Lang, paletteInfo } from "@/lib/content";
import { readPrefs } from "@/lib/state";

/**
 * Paints an auth page in the language and palette the person already chose, so
 * arriving from an email does not look like a different product than the app
 * the email was about.
 *
 * `ready` stays false until the preferences have been read: one frame of
 * English copy on the wrong ground is more jarring than one frame of nothing,
 * and the prefs come from localStorage, so the wait is imperceptible.
 */
export function useAuthChrome(): { lang: Lang; ready: boolean } {
  const [lang, setLang] = useState<Lang>("ar");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const prefs = readPrefs();
    if (prefs) {
      setLang(prefs.lang);
      const { theme } = paletteInfo(prefs.palette);
      document.documentElement.dataset.palette = prefs.palette;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", theme);
    }
    setReady(true);
  }, []);

  return { lang, ready };
}
