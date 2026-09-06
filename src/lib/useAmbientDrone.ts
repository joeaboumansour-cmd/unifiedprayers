"use client";

import { useEffect } from "react";

type Ctor = typeof AudioContext;

/**
 * A quiet three-note drone, faded in and out so it never clicks.
 * Built with oscillators rather than an audio file so the app stays offline
 * and adds nothing to the download.
 */
export function useAmbientDrone(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const Ctx: Ctor | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
    if (!Ctx) return;

    let ctx: AudioContext;
    try {
      ctx = new Ctx();
    } catch {
      return;
    }

    const gain = ctx.createGain();
    gain.gain.value = 0;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 620;

    const oscillators: OscillatorNode[] = [];
    [110, 164.8, 220.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.22;
      osc.connect(g);
      g.connect(filter);
      osc.start();
      oscillators.push(osc);
    });

    // A slow LFO on the master gain keeps the drone from sounding static.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.035;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start();
    oscillators.push(lfo);

    filter.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.linearRampToValueAtTime(0.085, ctx.currentTime + 2.5);

    // A gesture started this, but Safari can still hand back a suspended context.
    ctx.resume?.().catch(() => {});

    return () => {
      try {
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
      } catch {
        /* the context may already be closing */
      }
      window.setTimeout(() => {
        oscillators.forEach((o) => {
          try {
            o.stop();
          } catch {
            /* already stopped */
          }
        });
        ctx.close().catch(() => {});
      }, 1000);
    };
  }, [active]);
}
