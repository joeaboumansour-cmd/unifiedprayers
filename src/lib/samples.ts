"use client";

import { audioContext } from "@/lib/audio";

/**
 * Recorded sound: loading it once, and playing it on the app's shared context.
 *
 * Every file lives in /public/audio and is precached by the service worker, so
 * the app still has its sound with no connection. Each one is fetched and
 * decoded a single time and then kept — decoding is the expensive half, and a
 * sound that has to wait for it arrives after the moment it was for.
 *
 * All of it runs on the shared AudioContext that the first tap unlocks, for the
 * same reasons the chime does: a context made outside a gesture stays suspended
 * on iOS, and Safari caps how many a page may open.
 */

export const AUDIO = {
  night: "/audio/night-ambience.mp3",
  birds: "/audio/birds-day.mp3",
  piano: "/audio/piano-loop.mp3",
  chime: "/audio/chime.mp3",
} as const;

const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();

/** The decoded file, or null if it could not be fetched or decoded. */
export function loadSample(url: string): Promise<AudioBuffer | null> {
  const done = buffers.get(url);
  if (done) return Promise.resolve(done);

  const already = loading.get(url);
  if (already) return already;

  const ctx = audioContext();
  if (!ctx) return Promise.resolve(null);

  const job = fetch(url)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
    // The callback form is here for older Safari, where decodeAudioData does
    // not return a promise.
    .then(
      (bytes) =>
        new Promise<AudioBuffer>((resolve, reject) => {
          ctx.decodeAudioData(bytes, resolve, reject);
        }),
    )
    .then((buffer) => {
      buffers.set(url, buffer);
      return buffer;
    })
    .catch(() => null)
    .finally(() => loading.delete(url));

  loading.set(url, job);
  return job;
}

/** Warm the cache for sounds that will be wanted the moment a prayer opens. */
export function preloadSamples(urls: string[]): void {
  urls.forEach((url) => void loadSample(url));
}

/** The buffer if it is already decoded. Nothing is played on a cache miss. */
export function sample(url: string): AudioBuffer | null {
  return buffers.get(url) ?? null;
}

export type PlayOptions = {
  /** 0-1. Applied on top of whatever the file was recorded at. */
  gain?: number;
  /** Playback speed, which is also the pitch: 0.5 is an octave down. */
  rate?: number;
  /** -1 left, 1 right. Ignored where the browser has no stereo panner. */
  pan?: number;
  loop?: boolean;
  /** Seconds of fade at the start, so a loop arrives rather than begins. */
  fadeIn?: number;
  /** Where in the file to start, in seconds. */
  offset?: number;
  /** Node to play into. Defaults to the context destination. */
  target?: AudioNode;
};

export type Playing = {
  /** Fade out over `seconds`, then release the nodes. */
  stop: (seconds?: number) => void;
};

/**
 * Play a decoded buffer. Returns a handle for stopping it, or null when the
 * sound is unavailable — the caller should carry on either way, because sound
 * is never the point of the screen it is on.
 */
export function playSample(
  url: string,
  options: PlayOptions = {},
): Playing | null {
  const ctx = audioContext();
  const buffer = buffers.get(url);
  if (!ctx || !buffer) return null;

  const {
    gain = 1,
    rate = 1,
    pan = 0,
    loop = false,
    fadeIn = 0,
    offset = 0,
    target,
  } = options;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;
  source.playbackRate.value = rate;

  const level = ctx.createGain();
  const now = ctx.currentTime;
  if (fadeIn > 0) {
    level.gain.setValueAtTime(0.0001, now);
    level.gain.linearRampToValueAtTime(gain, now + fadeIn);
  } else {
    level.gain.value = gain;
  }

  source.connect(level);

  let tail: AudioNode = level;
  let panner: StereoPannerNode | null = null;
  if (pan !== 0 && typeof ctx.createStereoPanner === "function") {
    panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    level.connect(panner);
    tail = panner;
  }
  tail.connect(target ?? ctx.destination);

  source.start(0, offset);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      source.stop();
    } catch {
      /* already stopped */
    }
    source.disconnect();
    level.disconnect();
    panner?.disconnect();
  };

  // A one-shot cleans itself up; a loop waits to be told.
  if (!loop) source.onended = release;

  return {
    stop: (seconds = 0.4) => {
      if (released) return;
      const t = ctx.currentTime;
      try {
        level.gain.cancelScheduledValues(t);
        level.gain.setValueAtTime(level.gain.value, t);
        level.gain.linearRampToValueAtTime(0.0001, t + seconds);
      } catch {
        /* the context may already be closing */
      }
      window.setTimeout(release, seconds * 1000 + 120);
    },
  };
}
