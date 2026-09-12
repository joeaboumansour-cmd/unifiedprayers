"use client";

import { audioContext } from "@/lib/audio";
import { noiseBuffer } from "@/lib/sfx";

/**
 * The sounds the app makes outside a prayer: a page unsealing, a piece of it
 * arriving, a reading ticked off, a tab changing.
 *
 * All of them are built from the same two ingredients — sine partials with long
 * tails, and a sweep of filtered noise under them — and all of them are tuned
 * to the same scale, so that whatever order they happen in they sound like one
 * instrument rather than four unrelated effects. Nothing here is a recording:
 * the app already carries three minutes of audio for its ambience, and a
 * handful of one-second sounds would be another download for something a dozen
 * oscillator nodes can do exactly.
 *
 * Every sound is timed against the animation it accompanies rather than against
 * itself. A sound that finishes before the light does leaves the end of the
 * animation looking silent, which is worse than having no sound at all.
 */

/**
 * Whether the app is allowed to make a sound at all.
 *
 * One switch for everything, set from the ambient-sound preference. It lives
 * here rather than being passed down because these sounds are asked for from
 * all over the app — a reading opening, a tab changing, a page unsealing — and
 * threading a boolean through every one of those callers would put an audio
 * prop on components that have nothing else to do with audio.
 */
let enabled = false;

export function setGlimmerEnabled(on: boolean): void {
  enabled = on;
}

export function glimmerEnabled(): boolean {
  return enabled;
}

/**
 * D major pentatonic, low to high. A pentatonic scale holds no semitone, so any
 * two of these notes sounded together are consonant — which is what lets the
 * reveals below pick notes freely without ever landing on an interval that
 * sounds like something went wrong.
 *
 * D, because the bell at the end of a prayer is built on D as well.
 */
const SCALE = [587.33, 659.25, 739.99, 880.0, 987.77, 1174.66, 1318.51, 1479.98];

/** How far up that scale the next reveal sits. See `playGlimmer`. */
let rung = 0;

/** Start the next page at the bottom of the scale again. */
export function resetGlimmer(): void {
  rung = 0;
}

type VoiceOptions = {
  /** Seconds from now. */
  at?: number;
  peak?: number;
  /** Seconds from this voice's start to silence. */
  decay?: number;
  /** Seconds of rise, long enough that there is no edge to hear at the front. */
  attack?: number;
};

/**
 * One struck note: a sine with a soft front and a long tail, which is as close
 * to a bell as a single oscillator gets.
 *
 * The nodes are unhooked when the oscillator stops. The context outlives every
 * sound played on it, so a chain left connected is a chain held for the life of
 * the page — and these play a great deal more often than the closing bell does.
 */
function voice(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  { at = 0, peak = 0.06, decay = 1.4, attack = 0.02 }: VoiceOptions = {},
): void {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;

  const g = ctx.createGain();
  const t0 = ctx.currentTime + at;
  // Exponential ramps cannot touch zero, so the envelope runs between tiny
  // values instead — that is also what keeps the attack and tail click-free.
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);

  osc.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + decay + 0.05);
  osc.onended = () => {
    osc.disconnect();
    g.disconnect();
  };
}

/**
 * What every sound here is played into: a lowpass that takes the glassy edge
 * off the upper partials, and a gain that sits the family under the ambience
 * rather than over it.
 *
 * Built per sound and released once the longest tail has run, for the same
 * reason the voices are: the context is permanent, and anything still hanging
 * off it is held for as long as the app is open.
 */
function bus(ctx: AudioContext, gain: number): AudioNode {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 4200;
  filter.Q.value = 0.6;

  const master = ctx.createGain();
  master.gain.value = gain;

  filter.connect(master);
  master.connect(ctx.destination);

  window.setTimeout(() => {
    filter.disconnect();
    master.disconnect();
  }, 6000);

  return filter;
}

/**
 * Air under a reveal: filtered noise that opens upward and settles.
 *
 * The same trick the page turn between beads is built on, swept the other way.
 * On its own it is a breath; under the notes it is what makes them read as
 * light arriving rather than as an instrument being played.
 */
function air(ctx: AudioContext, dest: AudioNode, length: number, peak: number): void {
  const buffer = noiseBuffer(ctx);
  if (!buffer) return;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 0.8;

  const level = ctx.createGain();
  const now = ctx.currentTime;
  const rise = length * 0.35;

  band.frequency.setValueAtTime(700, now);
  band.frequency.exponentialRampToValueAtTime(4200, now + rise);
  band.frequency.exponentialRampToValueAtTime(1400, now + length);

  level.gain.setValueAtTime(0.0001, now);
  level.gain.exponentialRampToValueAtTime(peak, now + rise);
  level.gain.exponentialRampToValueAtTime(0.0001, now + length);

  source.connect(band);
  band.connect(level);
  level.connect(dest);
  // Somewhere random in the noise, so two reveals in a row are not the same
  // second of hiss twice.
  source.start(now, Math.random() * 0.5, length + 0.05);
  source.onended = () => {
    source.disconnect();
    band.disconnect();
    level.disconnect();
  };
}

/**
 * A page being unsealed: five notes climbing the scale, a low bell under them,
 * and the air rising through.
 *
 * This is the one that has to finish with the sparkles rather than before them.
 * The burst spends about a second and a half travelling and fading out, so the
 * last note is still ringing while the last grain is still lit.
 */
export function playReveal(): void {
  if (!enabled) return;
  const ctx = audioContext();
  if (!ctx) return;

  const out = bus(ctx, 0.7);

  // The body of the sound, an octave under the shimmer, so the burst has a
  // floor and does not read as tinkling.
  voice(ctx, out, 293.66, { at: 0, peak: 0.055, decay: 2.6, attack: 0.05 });
  voice(ctx, out, 440.0, { at: 0.04, peak: 0.04, decay: 2.2, attack: 0.05 });

  const climb: [freq: number, at: number, peak: number, decay: number][] = [
    [587.33, 0.0, 0.075, 1.9],
    [880.0, 0.1, 0.065, 1.9],
    [1174.66, 0.22, 0.05, 1.8],
    [1479.98, 0.36, 0.04, 1.7],
    [1760.0, 0.52, 0.03, 1.6],
  ];
  climb.forEach(([freq, at, peak, decay]) =>
    voice(ctx, out, freq, { at, peak, decay, attack: 0.03 }),
  );

  air(ctx, out, 1.5, 0.035);
}

/**
 * One more piece of a page arriving: two notes and a fifth, a step further up
 * the scale each time it is asked for.
 *
 * The climb is why this is not one sound repeated. Reading down a devotion is a
 * sequence, and a sequence that rises says so; it also keeps the fourth reveal
 * from sounding like a retread of the first. It wraps at the top of the scale
 * rather than climbing out of hearing.
 *
 * `soft` is the same shape at half the strength and an octave down, for places
 * where something opened but nothing was uncovered — moving between tabs.
 */
export function playGlimmer(soft = false): void {
  if (!enabled) return;
  const ctx = audioContext();
  if (!ctx) return;

  const out = bus(ctx, soft ? 0.4 : 0.62);
  const octave = soft ? 0.5 : 1;
  const root = SCALE[rung % SCALE.length] * octave;
  const above = SCALE[(rung + 2) % SCALE.length] * octave;
  // Only a real reveal moves up the scale. A tab change is not part of the
  // sequence and must not push it along.
  if (!soft) rung += 1;

  voice(ctx, out, root, { at: 0, peak: 0.06, decay: 1.3, attack: 0.025 });
  voice(ctx, out, above, { at: 0.08, peak: 0.045, decay: 1.5, attack: 0.03 });
  // The fifth above the root, quieter than either, which is what makes two
  // notes sound like a chord rather than like two notes.
  voice(ctx, out, root * 1.5, { at: 0.16, peak: 0.025, decay: 1.2, attack: 0.03 });

  if (!soft) air(ctx, out, 0.8, 0.018);
}

/**
 * The sound a tick makes as it draws itself.
 *
 * Two notes a fifth apart, the second landing where the stroke of the check
 * begins: the ring is drawn for about a third of a second before the check
 * crosses it, and the sound follows that shape rather than arriving all at
 * once. Shorter tails than the reveals — this is a confirmation, not an event.
 */
export function playTick(): void {
  if (!enabled) return;
  const ctx = audioContext();
  if (!ctx) return;

  const out = bus(ctx, 0.6);
  voice(ctx, out, 880.0, { at: 0, peak: 0.055, decay: 0.9, attack: 0.015 });
  voice(ctx, out, 1318.51, { at: 0.3, peak: 0.05, decay: 1.2, attack: 0.015 });
  voice(ctx, out, 1760.0, { at: 0.34, peak: 0.022, decay: 1.0, attack: 0.02 });
}
