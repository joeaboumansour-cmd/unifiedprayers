"use client";

import { useEffect, useState } from "react";

import { type Lang, paletteInfo } from "@/lib/content";
import { readPrefs } from "@/lib/state";

/**
 * Paints an auth page in the palette the person already chose, so arriving
 * from an email does not look like a different product than the app the email
 * was about.
 *
 * The palette follows the app; the language does not. Every account surface —
 * sign in, sign up, the emailed codes, forgotten passwords, sign out and the
 * Settings card they all lead back to — is English whatever the app is set to,
 * so the wording of an account instruction is the same one everywhere it is
 * read. `lang` is returned all the same: the copy tables, the field checks in
 * username.ts and the messages from useAuth are all still keyed by language,
 * and this is the single place that decides which key the auth pages use.
 *
 * `ready` stays false until the preferences have been read: one frame on the
 * wrong ground is more jarring than one frame of nothing, and the prefs come
 * from localStorage, so the wait is imperceptible.
 */
export function useAuthChrome(): { lang: Lang; ready: boolean } {
  const lang: Lang = "en";
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const prefs = readPrefs();
    if (prefs) {
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
