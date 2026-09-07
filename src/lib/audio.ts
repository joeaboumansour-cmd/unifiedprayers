"use client";

/**
 * One AudioContext for the whole app, unlocked by the first touch.
 *
 * Every browser refuses to start audio that a person did not ask for, and each
 * refuses in its own way: Chrome hands back a context stuck in "suspended",
 * Safari does the same and only lets `resume()` through while a gesture is
 * still being handled. A context built inside a React effect is already too
 * late for Safari, because the effect runs after the tap that caused it. So the
 * context is created and resumed from the event handler itself, before any
 * sound is asked for, and then kept for the life of the page.
 *
 * Keeping it also avoids the other half of the problem: Safari caps how many
 * contexts a page may open, so a fresh one per chime eventually stops making
 * any sound at all.
 */

type Ctor = typeof AudioContext;

/** iOS 16.4+ exposes this and nothing types it yet. */
type AudioSession = { type: string };
type NavigatorWithSession = Navigator & { audioSession?: AudioSession };

let ctx: AudioContext | null = null;
let listening = false;

function construct(): AudioContext | null {
  const Ctx: Ctor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!Ctx) return null;

  // Without this, iOS treats web audio as a notification sound: the ring/silent
  // switch mutes it, which is exactly how a phone carried to church is set.
  // "playback" moves it to the media channel, where the volume keys apply
  // instead. Unknown on every other platform, and harmless there.
  try {
    const nav = navigator as NavigatorWithSession;
    if (nav.audioSession) nav.audioSession.type = "playback";
  } catch {
    /* the property is read-only on some builds */
  }

  try {
    return new Ctx();
  } catch {
    return null; // no audio hardware, or the page is not allowed any
  }
}

/**
 * Create and resume the shared context. Call this from inside a user gesture —
 * a tap handler, not an effect — and call it often: resuming an already running
 * context costs nothing, and a context can be suspended again by the system at
 * any time (a phone call, a locked screen, a backgrounded tab).
 */
export function primeAudio(): void {
  if (typeof window === "undefined") return;
  ctx ??= construct();
  if (!ctx) return;
  if (ctx.state !== "running") ctx.resume().catch(() => {});
}

/**
 * The shared context, or null where web audio is unavailable. Returns a
 * suspended context rather than waiting for one: the caller can schedule into
 * it now and the sound starts when the unlock lands.
 */
export function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  ctx ??= construct();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/** Whether sound can actually be heard right now. */
export function audioReady(): boolean {
  return ctx?.state === "running";
}

/**
 * Unlock on the first gesture anywhere in the app, and re-unlock whenever the
 * app comes back to the front. Idempotent, so it is safe to mount from more
 * than one place.
 */
export function watchAudioUnlock(): () => void {
  if (typeof window === "undefined" || listening) return () => {};
  listening = true;

  const kinds = ["pointerdown", "touchend", "keydown"] as const;
  // Capture phase, so a handler that stops propagation cannot swallow it.
  const opts: AddEventListenerOptions = { capture: true, passive: true };
  kinds.forEach((k) => window.addEventListener(k, primeAudio, opts));

  const onVisible = () => {
    if (document.visibilityState === "visible") primeAudio();
  };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    kinds.forEach((k) => window.removeEventListener(k, primeAudio, opts));
    document.removeEventListener("visibilitychange", onVisible);
    listening = false;
  };
}
