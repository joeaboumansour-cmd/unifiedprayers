"use client";

import { useEffect, useState } from "react";

/**
 * The dove, held over the app until it knows how to draw itself.
 *
 * The first render of the page is the defaults — Arabic, the default size and
 * palette — because nothing on the server can know this reader's choices. A
 * moment later the device's own preferences are read, and for somebody signed
 * in, another moment later the account's may replace them. Drawn as it went,
 * that was the app appearing and then rearranging itself under the reader's
 * thumb. This covers it until the last of those has landed.
 *
 * It starts as an exact copy of the iOS launch image — the same logo, at the
 * same 62% of the short side, on the same #4f0305 — so an installed app goes
 * from Apple's still picture to this without a visible seam. Then it comes
 * alive: light turning slowly across the dove, a warm glow breathing, and five
 * beads lighting in turn beneath it, a decade being prayed. When the app is
 * ready the whole thing lifts away.
 *
 * It is in the server-rendered HTML, so it is the first thing painted, before
 * any script runs.
 */

/** Matches SPLASH_LOGO in scripts/generate-icons.mjs, and the launch images it writes. */
const LOGO = "62vmin";
/** The ground the logo and every launch image are drawn on. */
const GROUND = "#4f0305";
/** Never a flash: once shown, it stays at least this long. */
const MIN_MS = 700;
/** Never a trap: a network that does not answer does not keep the app hidden. */
const MAX_MS = 3500;
/** How long lifting away takes; matches .ls-leave in globals.css. */
const LEAVE_MS = 560;

/** Fired on window once the splash has gone. */
export const REVEALED = "up:revealed";

/** Runs `fn` once the app is visible: now if it already is, or when the splash lifts. */
export function whenRevealed(fn: () => void): () => void {
  if (document.documentElement.dataset.revealed !== undefined) {
    fn();
    return () => {};
  }
  window.addEventListener(REVEALED, fn, { once: true });
  return () => window.removeEventListener(REVEALED, fn);
}

export default function LaunchSplash({ ready }: { ready: boolean }) {
  const [phase, setPhase] = useState<"shown" | "leaving" | "gone">("shown");
  const [minPassed, setMinPassed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const min = window.setTimeout(() => setMinPassed(true), MIN_MS);
    const max = window.setTimeout(() => setTimedOut(true), MAX_MS);
    return () => {
      window.clearTimeout(min);
      window.clearTimeout(max);
    };
  }, []);

  useEffect(() => {
    if (phase !== "shown") return;
    if (!timedOut && !(ready && minPassed)) return;
    setPhase("leaving");
  }, [ready, minPassed, timedOut, phase]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const t = window.setTimeout(() => {
      setPhase("gone");
      // Anything that should be seen happening — the daily verse arriving from
      // its notification — waits for this rather than playing under the dove.
      document.documentElement.dataset.revealed = "";
      window.dispatchEvent(new Event(REVEALED));
    }, LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase === "gone") return null;
  const leaving = phase === "leaving";

  return (
    <div
      role="status"
      aria-label="Loading"
      className={leaving ? "ls-leave" : undefined}
      style={{
        position: "fixed",
        // To the real bottom edge on an iOS home-screen app; 0 everywhere else.
        inset: "0 0 calc(-1 * var(--ios-gap, 0px)) 0",
        zIndex: 3000,
        overflow: "hidden",
        background: GROUND,
        display: "grid",
        placeItems: "center",
        pointerEvents: leaving ? "none" : "auto",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/icon-512.png"
        alt=""
        width={512}
        height={512}
        fetchPriority="high"
        className="ls-dove"
        style={{ position: "relative", width: LOGO, height: LOGO }}
      />

      {/* The warm light the dove sits in, breathing. Screened over the logo
          like the rays below, so it can only ever brighten it. */}
      <div
        aria-hidden="true"
        className="ls-glow"
        style={{
          position: "absolute",
          width: `calc(${LOGO} * 1.3)`,
          height: `calc(${LOGO} * 1.3)`,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgb(255 226 160 / .16), rgb(255 226 160 / 0) 60%)",
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />

      {/* Light turning across the dove: thin gold rays on a slow wheel, faded
          out towards the edges. Laid over the logo and screened into it rather
          than set behind it, because behind a full-bleed square they would
          stop at its edge and draw the square. They arrive after the first
          frame, so that frame is still Apple's launch image. */}
      <div
        aria-hidden="true"
        className="ls-rays"
        style={{
          position: "absolute",
          width: "160vmax",
          height: "160vmax",
          left: "50%",
          top: "50%",
          background:
            "repeating-conic-gradient(from 0deg, rgb(232 199 126 / .10) 0deg 1.6deg, transparent 1.6deg 11deg)",
          WebkitMaskImage: "radial-gradient(circle, #000 6%, rgb(0 0 0 / .5) 24%, transparent 50%)",
          maskImage: "radial-gradient(circle, #000 6%, rgb(0 0 0 / .5) 24%, transparent 50%)",
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />

      {/* A decade, prayed: five beads lighting one after another. */}
      <div
        aria-hidden="true"
        className="ls-beads"
        style={{
          position: "absolute",
          top: `calc(50% + ${LOGO} / 2 + 22px)`,
          display: "flex",
          gap: 10,
        }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="ls-bead"
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "rgb(232 199 126)",
              animationDelay: `${i * 0.22}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
