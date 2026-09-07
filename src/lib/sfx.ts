"use client";

import { AUDIO, playSample, preloadSamples } from "@/lib/samples";

/**
 * The two sounds a prayer makes on its own: a page turning as you move between
 * beads, and a chime when it is finished.
 *
 * Both are quiet by design. A page turn happens sixty times in a rosary, so it
 * has to sit at the level of a sound you stop noticing by the third decade —
 * loud enough to answer the tap, not loud enough to keep announcing itself.
 */

const TURN_GAIN = 0.3;
const CHIME_GAIN = 0.5;

/** Fetch and decode before the first tap needs them. */
export function preloadSfx(): void {
  preloadSamples([AUDIO.pageTurn, AUDIO.chime, AUDIO.piano]);
}

/**
 * A page turning. `back` plays it slightly slower, which is the difference
 * between moving on and going back a step.
 */
export function playPageTurn(back = false): void {
  playSample(AUDIO.pageTurn, {
    gain: TURN_GAIN * (back ? 0.9 : 1),
    // A shade of variation each time, so sixty of them do not read as one
    // sound repeating.
    rate: (back ? 0.88 : 1) * (0.96 + Math.random() * 0.08),
  });
}

/** The bell at the end of a prayer. */
export function playChimeSample(): boolean {
  return playSample(AUDIO.chime, { gain: CHIME_GAIN }) !== null;
}
