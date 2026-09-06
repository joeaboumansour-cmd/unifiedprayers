"use client";

/**
 * Whether the app is in the middle of something a page reload would ruin.
 *
 * There is exactly one caller on each side: the player sets it while a prayer
 * is open, and the service worker layer reads it before applying a new build.
 * A new build is never urgent enough to drop somebody back to the home screen
 * halfway through a decade, and the wait is over the moment the prayer ends.
 *
 * A module-level flag rather than context: the two sides sit in different
 * trees (the page, and PwaLayer in the root layout), and threading a provider
 * between them would be a lot of wiring for one boolean.
 */

let busy = false;
const listeners = new Set<(busy: boolean) => void>();

export function isAppBusy(): boolean {
  return busy;
}

export function setAppBusy(next: boolean): void {
  if (next === busy) return;
  busy = next;
  for (const fn of listeners) fn(busy);
}

export function subscribeAppBusy(fn: (busy: boolean) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
