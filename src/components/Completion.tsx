"use client";

import { useEffect, useRef, useState } from "react";
import { type Lang, ui } from "@/lib/content";

/* The tick is drawn, not faded in, so the two strokes have to know their own
   length. Both are measured off the geometry below. */
const RING_LEN = 314; /* 2 * PI * r, r = 50 */
const TICK_LEN = 64;

export type CompletionProps = {
  open: boolean;
  lang: Lang;
  onDismiss: () => void;
};

/**
 * The closing moment of a prayer: a tick draws itself, a word of thanks rises,
 * and the player hands itself back to the home screen.
 */
export default function Completion({ open, lang, onDismiss }: CompletionProps) {
  const t = ui(lang);

  /* The tap that completed the prayer must not also dismiss the thing it just
     opened, so the overlay ignores pointers until the tick has been drawn. */
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (!open) return void setArmed(false);
    timer.current = window.setTimeout(() => setArmed(true), 900);
    return () => window.clearTimeout(timer.current);
  }, [open]);

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        if (armed) onDismiss();
      }}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        background: "var(--grad-player)",
        opacity: open ? 1 : 0,
        transition: "opacity .5s ease",
        pointerEvents: open ? "auto" : "none",
      }}
      aria-hidden={!open}
      role="status"
    >
      {/* the glow the tick sits in */}
      <div
        style={{
          position: "absolute",
          width: 320,
          height: 320,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgb(var(--accent-rgb) / .22), transparent 68%)",
          animation: open ? "doneGlow 4s ease-in-out infinite" : "none",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", width: 120, height: 120 }}>
        {/* the ring that expands away once the tick lands */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "1px solid rgb(var(--accent-rgb) / .5)",
            animation: open ? "donePulse 1.5s var(--ease) .75s both" : "none",
          }}
        />
        <svg
          viewBox="0 0 120 120"
          width="120"
          height="120"
          fill="none"
          style={{ display: "block", position: "relative" }}
        >
          <circle
            cx="60"
            cy="60"
            r="50"
            stroke="rgb(var(--veil-rgb) / .10)"
            strokeWidth="2"
          />
          <circle
            cx="60"
            cy="60"
            r="50"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={RING_LEN}
            strokeDashoffset={RING_LEN}
            /* Drawn from the top rather than from three o'clock. */
            transform="rotate(-90 60 60)"
            style={{
              animation: open ? "doneRing .8s var(--ease) .1s forwards" : "none",
            }}
          />
          <path
            d="M40 61 L54 76 L82 45"
            stroke="var(--accent)"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={TICK_LEN}
            strokeDashoffset={TICK_LEN}
            style={{
              animation: open ? "doneTick .45s var(--ease) .62s forwards" : "none",
            }}
          />
        </svg>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          textAlign: "center",
          padding: "0 32px",
          position: "relative",
        }}
      >
        <div
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-.01em",
            animation: open ? "doneRise .6s var(--ease) 1s both" : "none",
          }}
        >
          {t.doneTitle}
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 300,
            lineHeight: 1.7,
            color: "var(--soft)",
            animation: open ? "doneRise .6s var(--ease) 1.18s both" : "none",
          }}
        >
          {t.doneNote}
        </div>
      </div>
    </div>
  );
}
