"use client";

import { useEffect, useRef } from "react";

import { audioContext } from "@/lib/audio";
import { AUDIO, loadSample, playSample, type Playing } from "@/lib/samples";

/**
 * The bed of sound under an open prayer, chosen by the clock: birdsong in
 * daylight, crickets and night air after dark. Both are field recordings, on a
 * continuous loop.
 *
 * Over them, a piano phrase that comes and goes. It is a played passage, not
 * notes assembled here — a single chord dropped on a timer sounds like a warning
 * however it is voiced, because nothing is going anywhere. So the piano arrives,
 * plays through the phrase for half a minute or so, and leaves for a minute or
 * two.
 *
 * The recordings are precached by the service worker, so this works with no
 * connection. Everything runs on the app's shared context, which the first tap
 * unlocks.
 */

/** Birds from six in the morning until six in the evening; night otherwise. */
function isDaytime(): boolean {
  const h = new Date().getHours();
  return h >= 6 && h < 18;
}

/** Loud enough to notice if you listen for it, quiet enough to forget. */
const BED_GAIN = 0.42;
const PIANO_GAIN = 0.5;

/** How long the piano plays for, and how long it stays away afterwards. */
const PIANO_FADE_IN = 5;
const PIANO_FADE_OUT = 6;
const PIANO_PLAY_MIN_MS = 38_000;
const PIANO_PLAY_SPREAD_MS = 24_000;
const PIANO_REST_MIN_MS = 70_000;
const PIANO_REST_SPREAD_MS = 80_000;

export function useAmbience(active: boolean) {
  // These outlive the effect body that starts them, because loading a file is
  // asynchronous and the screen may close first.
  const bed = useRef<Playing | null>(null);
  const piano = useRef<Playing | null>(null);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const timers: number[] = [];
    const file = isDaytime() ? AUDIO.birds : AUDIO.night;

    void loadSample(file).then((buffer) => {
      if (cancelled || !buffer) return;
      bed.current = playSample(file, {
        gain: BED_GAIN,
        loop: true,
        fadeIn: 4,
        // A recording started at its own first frame announces itself. Coming
        // in part-way through, it is already going on when you arrive.
        offset: Math.random() * Math.max(0, buffer.duration - 8),
      });
    });

    void loadSample(AUDIO.piano).then((buffer) => {
      if (cancelled || !buffer) return;

      const rest = () => {
        if (cancelled) return;
        timers.push(
          window.setTimeout(
            play,
            PIANO_REST_MIN_MS + Math.random() * PIANO_REST_SPREAD_MS,
          ),
        );
      };

      const play = () => {
        if (cancelled) return;
        // Only while the context is actually running. Started into a suspended
        // context, the phrase would be part-way through by the time it resumed.
        if (audioContext()?.state !== "running") {
          rest();
          return;
        }

        piano.current = playSample(AUDIO.piano, {
          gain: PIANO_GAIN,
          loop: true,
          fadeIn: PIANO_FADE_IN,
          // Entering at a different point each time keeps the passage from
          // being the same phrase in the same order every prayer.
          offset: Math.random() * buffer.duration,
        });

        timers.push(
          window.setTimeout(
            () => {
              piano.current?.stop(PIANO_FADE_OUT);
              piano.current = null;
              rest();
            },
            PIANO_PLAY_MIN_MS + Math.random() * PIANO_PLAY_SPREAD_MS,
          ),
        );
      };

      // Not at once: the bed should be established first, and a prayer does not
      // open with music.
      timers.push(window.setTimeout(play, 25_000 + Math.random() * 20_000));
    });

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
      bed.current?.stop(1.6);
      bed.current = null;
      piano.current?.stop(1.6);
      piano.current = null;
    };
  }, [active]);
}
