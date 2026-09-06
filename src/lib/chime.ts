"use client";

type Ctor = typeof AudioContext;

/**
 * A soft bell rung once when a prayer is finished.
 *
 * Synthesised for the same reason as the ambient drone: no audio file, so the
 * app keeps working offline and the download does not grow. Three rising
 * partials, each with its own long decay, read as one struck bell rather than
 * three notes.
 */
export function playChime(): void {
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
    return osc;
  });

  // A gesture started this, but Safari can still hand back a suspended context.
  ctx.resume?.().catch(() => {});

  window.setTimeout(() => {
    oscillators.forEach((o) => {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    });
    ctx.close().catch(() => {});
  }, 3200);
}
