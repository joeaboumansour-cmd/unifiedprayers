"use client";

import { audioContext } from "@/lib/audio";
import { AUDIO, playSample, preloadSamples } from "@/lib/samples";

/**
 * The two sounds a prayer makes on its own: a soft breath as you move between
 * beads, and a chime when it is finished.
 *
 * The breath is synthesised rather than recorded. A real page-turn recording is
 * paper: it has grain and a snap at the front, and sixty snaps in a rosary
 * become a sound you are counting instead of praying through. What replaces it
 * is filtered noise with no attack at all — a low hush that rises and settles,
 * closer to a held breath than to a page.
 *
 * It is quiet by design, quieter than the recording it replaces. It should
 * answer the tap and then be gone.
 */

const TURN_PEAK = 0.045;
const CHIME_GAIN = 0.5;

/** Fetch and decode before the first tap needs them. */
export function preloadSfx(): void {
  preloadSamples([AUDIO.chime, AUDIO.piano]);
}

let noise: AudioBuffer | null = null;

/**
 * A second of white noise, made once and reused. Building it per turn costs a
 * fresh buffer of random numbers on the tap itself, which is the one moment
 * that has to stay smooth.
 */
function noiseBuffer(ctx: AudioContext): AudioBuffer | null {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  try {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    noise = buffer;
    return buffer;
  } catch {
    return null;
  }
}

/**
 * The breath between beads. `back` plays it lower and slower, which is the
 * difference between moving on and going back a step.
 *
 * Two filters shape the noise into air: a lowpass that opens a little and then
 * closes, and a highpass that keeps the rumble out. The gain envelope has a
 * long enough attack that there is no edge to hear at the front, and a longer
 * tail than head, so the sound leaves rather than stops.
 */
export function playPageTurn(back = false): void {
  const ctx = audioContext();
  if (!ctx) return;

  const buffer = noiseBuffer(ctx);
  if (!buffer) return;

  // A shade of variation each time, so sixty of them do not read as one sound
  // repeating.
  const drift = 0.94 + Math.random() * 0.12;
  const open = (back ? 700 : 950) * drift;
  const close = (back ? 260 : 340) * drift;
  const rise = back ? 0.09 : 0.07;
  const fall = back ? 0.34 : 0.28;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  // Start somewhere random in the noise, for the same reason as the drift.
  const offset = Math.random() * 0.5;

  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.Q.value = 0.4;

  const high = ctx.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = 180;

  const level = ctx.createGain();

  const now = ctx.currentTime;
  low.frequency.setValueAtTime(close, now);
  low.frequency.exponentialRampToValueAtTime(open, now + rise);
  low.frequency.exponentialRampToValueAtTime(close, now + rise + fall);

  // Exponential ramps cannot touch zero, so the envelope runs between tiny
  // values instead — that is also what keeps the attack and tail click-free.
  const peak = TURN_PEAK * (back ? 0.85 : 1);
  level.gain.setValueAtTime(0.0001, now);
  level.gain.exponentialRampToValueAtTime(peak, now + rise);
  level.gain.exponentialRampToValueAtTime(0.0001, now + rise + fall);

  source.connect(high);
  high.connect(low);
  low.connect(level);
  level.connect(ctx.destination);

  const length = rise + fall;
  source.start(now, offset, length + 0.05);

  // The context outlives the sound, so its nodes are unhooked by hand once the
  // tail has run. Left connected, every bead would add another dead chain.
  source.onended = () => {
    source.disconnect();
    high.disconnect();
    low.disconnect();
    level.disconnect();
  };
}

/** The bell at the end of a prayer. */
export function playChimeSample(): boolean {
  return playSample(AUDIO.chime, { gain: CHIME_GAIN }) !== null;
}
