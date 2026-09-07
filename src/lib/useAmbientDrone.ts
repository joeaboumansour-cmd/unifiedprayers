"use client";

import { useEffect } from "react";

import { audioContext } from "@/lib/audio";

/**
 * A quiet three-note drone, faded in and out so it never clicks.
 * Built with oscillators rather than an audio file so the app stays offline
 * and adds nothing to the download.
 *
 * It runs on the app's shared context, which the first tap unlocks. Scheduling
 * into a context that is still suspended is fine: the fade starts from the
 * moment it resumes, not from silence part-way through.
 */
export function useAmbientDrone(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const ctx = audioContext();
    if (!ctx) return;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 620;

    const nodes: AudioNode[] = [gain, filter];
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
      nodes.push(g);
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
    nodes.push(lfoGain);

    filter.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.linearRampToValueAtTime(0.085, ctx.currentTime + 2.5);

    return () => {
      try {
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
      } catch {
        /* the context may already be closing */
      }
      // The context is shared and stays open, so the drone takes its own nodes
      // down once the fade has finished.
      window.setTimeout(() => {
        oscillators.forEach((o) => {
          try {
            o.stop();
          } catch {
            /* already stopped */
          }
          o.disconnect();
        });
        nodes.forEach((n) => n.disconnect());
      }, 1000);
    };
  }, [active]);
}
