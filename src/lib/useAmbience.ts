"use client";

import { useEffect } from "react";

import { audioContext } from "@/lib/audio";

/**
 * The bed of sound under an open prayer, chosen by the clock.
 *
 * After dark it is a slow, low pad: a root, its fifth and its octave, so the
 * voices sit in tune with each other instead of beating, under a soft band of
 * noise for air. Nothing in it moves quickly.
 *
 * In daylight it is birdsong over a much quieter, brighter pad — short chirps
 * at uneven intervals, the way a garden actually sounds, rather than a loop.
 *
 * Everything is synthesised for the same reason the chime is: no audio file, so
 * the app keeps working offline and the download does not grow. It runs on the
 * app's shared context, which the first tap unlocks; scheduling into a context
 * that is still suspended is fine, because the fade starts from the moment it
 * resumes rather than part-way through.
 */

/** Birds from six in the morning until six in the evening; the pad otherwise. */
function isDaytime(): boolean {
  const h = new Date().getHours();
  return h >= 6 && h < 18;
}

/** Brown-ish noise, quieter the higher it goes, which reads as air not hiss. */
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}

/** A panner where there is one, so chirps land off to one side or the other. */
function panner(ctx: AudioContext, value: number): StereoPannerNode | null {
  if (typeof ctx.createStereoPanner !== "function") return null;
  const node = ctx.createStereoPanner();
  node.pan.value = value;
  return node;
}

type Voice = { freq: number; gain: number; detune: number };

const NIGHT_VOICES: Voice[] = [
  { freq: 65.41, gain: 0.5, detune: 0 }, // C2
  { freq: 98.0, gain: 0.3, detune: -3 }, // G2, a fifth above
  { freq: 130.81, gain: 0.22, detune: 3 }, // C3
  { freq: 196.0, gain: 0.07, detune: 0 }, // G3, barely there
];

const DAY_VOICES: Voice[] = [
  { freq: 196.0, gain: 0.34, detune: 0 }, // G3
  { freq: 293.66, gain: 0.2, detune: -2 }, // D4
  { freq: 392.0, gain: 0.1, detune: 2 }, // G4
];

export function useAmbience(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const shared = audioContext();
    if (!shared) return;
    // Bound to a const so the null check above still holds inside the chirp
    // scheduler, which is hoisted past it.
    const ctx = shared;

    const day = isDaytime();

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const nodes: AudioNode[] = [master];
    const sources: (OscillatorNode | AudioBufferSourceNode)[] = [];
    const timers: number[] = [];

    /* ---------------- the pad ---------------- */
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = day ? 1100 : 340;
    padFilter.Q.value = 0.4;

    const pad = ctx.createGain();
    // Daylight belongs to the birds, so the pad under them is faint.
    const padLevel = day ? 0.028 : 0.075;
    pad.gain.value = padLevel;
    padFilter.connect(pad);
    pad.connect(master);
    nodes.push(padFilter, pad);

    (day ? DAY_VOICES : NIGHT_VOICES).forEach(({ freq, gain, detune }) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      // A few cents apart, the voices drift in and out of phase slowly enough
      // to sound alive without the beating that reads as out of tune.
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g);
      g.connect(padFilter);
      osc.start();
      sources.push(osc);
      nodes.push(g);
    });

    // Two slow swells at unrelated rates, so the pad never repeats audibly.
    [
      { rate: 0.023, depth: 0.35 },
      { rate: 0.037, depth: 0.22 },
    ].forEach(({ rate, depth }) => {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = padLevel * depth;
      lfo.connect(lfoGain);
      lfoGain.connect(pad.gain);
      lfo.start();
      sources.push(lfo);
      nodes.push(lfoGain);
    });

    /* ---------------- air ---------------- */
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = day ? "highpass" : "lowpass";
    noiseFilter.frequency.value = day ? 1800 : 420;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = day ? 0.012 : 0.05;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);
    noise.start();
    sources.push(noise);
    nodes.push(noiseFilter, noiseGain);

    /* ---------------- birdsong ---------------- */
    // One call: a handful of short notes, each a rising or falling sweep. The
    // notes and the gaps are drawn fresh every time, so no two calls match.
    function chirp(): void {
      const now = ctx.currentTime;
      const base = 1900 + Math.random() * 1700;
      const notes = 2 + Math.floor(Math.random() * 4);

      const voice = ctx.createGain();
      voice.gain.value = 0.16 + Math.random() * 0.12;
      const pan = panner(ctx, Math.random() * 1.4 - 0.7);
      if (pan) {
        voice.connect(pan);
        pan.connect(master);
      } else {
        voice.connect(master);
      }

      const built: { osc: OscillatorNode; g: GainNode }[] = [];
      let at = 0;
      for (let i = 0; i < notes; i += 1) {
        const t0 = now + at;
        const length = 0.05 + Math.random() * 0.07;
        const start = base * (0.9 + Math.random() * 0.35);
        // Up or down across the note, which is what makes a chirp a chirp
        // rather than a beep.
        const end = start * (Math.random() < 0.6 ? 1.35 : 0.72);

        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(start, t0);
        osc.frequency.exponentialRampToValueAtTime(end, t0 + length);

        const g = ctx.createGain();
        // Exponential ramps cannot touch zero, so the envelope runs between
        // tiny values instead — that is also what keeps it click-free.
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(1, t0 + length * 0.25);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + length);

        osc.connect(g);
        g.connect(voice);
        osc.start(t0);
        osc.stop(t0 + length + 0.02);
        built.push({ osc, g });
        at += length + 0.02 + Math.random() * 0.05;
      }

      // The context outlives the call, so its nodes come down by hand once the
      // last note has run. Left connected, every chirp would add a dead chain.
      timers.push(
        window.setTimeout(
          () => {
            built.forEach(({ osc, g }) => {
              try {
                osc.stop();
              } catch {
                /* already stopped */
              }
              osc.disconnect();
              g.disconnect();
            });
            pan?.disconnect();
            voice.disconnect();
          },
          (at + 0.5) * 1000,
        ),
      );
    }

    function scheduleChirp(first: boolean): void {
      const wait = first
        ? 1200 + Math.random() * 1500
        : 1800 + Math.random() * 5200;
      timers.push(
        window.setTimeout(() => {
          chirp();
          scheduleChirp(false);
        }, wait),
      );
    }
    if (day) scheduleChirp(true);

    // Long enough that the sound arrives rather than starts.
    master.gain.linearRampToValueAtTime(1, ctx.currentTime + (day ? 3 : 5));

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
        master.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
      } catch {
        /* the context may already be closing */
      }
      // The context is shared and stays open, so the bed takes its own nodes
      // down once the fade has finished.
      window.setTimeout(() => {
        sources.forEach((s) => {
          try {
            s.stop();
          } catch {
            /* already stopped */
          }
          s.disconnect();
        });
        nodes.forEach((n) => n.disconnect());
      }, 1400);
    };
  }, [active]);
}
