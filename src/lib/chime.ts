"use client";

import { audioContext } from "@/lib/audio";

/**
 * A soft bell rung once when a prayer is finished.
 *
 * Synthesised for the same reason as the ambience: no audio file, so the
 * app keeps working offline and the download does not grow. Four rising
 * partials, each with its own long decay, read as one struck bell rather than
 * four notes.
 *
 * The context is the app's shared one. A bell built on its own context is
 * silent on iOS, where a context made outside a gesture stays suspended, and
 * silent everywhere after a few prayers, because Safari caps how many contexts
 * one page may hold.
 */
export function playChime(): void {
  const ctx = audioContext();
  if (!ctx) return;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2600;

  const master = ctx.createGain();
  master.gain.value = 0.9;
  filter.connect(master);
  master.connect(ctx.destination);

  const now = ctx.currentTime;
  const voices: [freq: number, at: number, peak: number, decay: number][] = [
    [293.66, 0, 0.05, 2.6],
    [587.33, 0, 0.13, 2.4],
    [880.0, 0.13, 0.09, 2.0],
    [1174.66, 0.28, 0.06, 1.8],
  ];

  let last = 0;
  const oscillators = voices.map(([freq, at, peak, decay]) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const g = ctx.createGain();
    const t0 = now + at;
    // Exponential ramps cannot touch zero, so the envelope runs between tiny
    // values instead — that is also what keeps the attack and tail click-free.
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);

    osc.connect(g);
    g.connect(filter);
    osc.start(t0);
    osc.stop(t0 + decay + 0.1);
    last = Math.max(last, at + decay + 0.1);
    return { osc, g };
  });

  // The context outlives the bell, so its nodes are unhooked by hand once the
  // tail has run. Left connected, every prayer would add another dead chain.
  window.setTimeout(
    () => {
      oscillators.forEach(({ osc, g }) => {
        try {
          osc.stop();
        } catch {
          /* already stopped */
        }
        osc.disconnect();
        g.disconnect();
      });
      filter.disconnect();
      master.disconnect();
    },
    (last + 0.3) * 1000,
  );
}
