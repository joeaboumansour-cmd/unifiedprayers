"use client";

/**
 * "The app is in front of the reader again" — one subscription, because four
 * hooks want it and each writing its own listener set means four subtly
 * different answers to when a screen coming back on counts.
 *
 * An installed PWA is not reloaded for days: it is backgrounded and resumed.
 * So everything the app pulls from Supabase — the prayer text, the verse, the
 * announcements, the build itself — is as stale as the last time the app
 * happened to mount, unless something asks again on the way back in. This is
 * that something.
 */

/** Two resumes inside this window are one resume: iOS fires several at once. */
const COALESCE_MS = 2_000;

/**
 * Calls `fn` whenever the app comes back to the foreground, regains focus, or
 * regains a connection — and, if `everyMs` is given, on that beat as well while
 * the app is actually on screen. Returns the unsubscribe.
 */
export function onForeground(fn: () => void, everyMs = 0): () => void {
  let last = 0;
  let timer: number | undefined;

  const run = () => {
    const now = Date.now();
    if (now - last < COALESCE_MS) return;
    last = now;
    fn();
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") run();
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", run);
  // A resume with no connection cannot refresh anything; the answer arrives
  // when the connection does.
  window.addEventListener("online", run);

  if (everyMs > 0) {
    timer = window.setInterval(() => {
      // A hidden tab polling a database is battery spent on a screen nobody is
      // looking at. The visibility listener covers the moment it matters.
      if (document.visibilityState === "visible") run();
    }, everyMs);
  }

  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", run);
    window.removeEventListener("online", run);
    if (timer !== undefined) window.clearInterval(timer);
  };
}
