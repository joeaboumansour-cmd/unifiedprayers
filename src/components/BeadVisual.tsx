"use client";

import type { CSSProperties } from "react";
import type { BeadStyle, Lang, PrayerId } from "@/lib/content";
import { DASH_LENGTH, type Bead, type Step, beadGeometry } from "@/lib/steps";

const EASE = "cubic-bezier(.22,1,.36,1)";

/** The dove / Mary image with its breathing halo, shared by every style. */
function Centre({
  size,
  haloScale = 1,
  prayer,
}: {
  size: number;
  haloScale?: number;
  prayer: PrayerId;
}) {
  const imgStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    borderRadius: "50%",
    mixBlendMode: "screen",
    WebkitMaskImage:
      "radial-gradient(circle at 50% 50%,#000 52%,transparent 82%)",
    maskImage: "radial-gradient(circle at 50% 50%,#000 52%,transparent 82%)",
    transition: "opacity .45s ease",
  };
  return (
    <div
      style={{
        position: "relative",
        width: size * haloScale,
        height: size * haloScale,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background:
            "radial-gradient(circle,rgb(var(--accent-soft-rgb) / .5) 0%,rgb(var(--accent-rgb) / .22) 42%,rgb(var(--accent-rgb) / 0) 72%)",
          filter: "blur(6px)",
          animation: "upHalo 6.5s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          animation: "upBreathe 6.5s ease-in-out infinite",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/dove.webp"
          alt=""
          style={{ ...imgStyle, opacity: prayer === "mary" ? 0 : 1 }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mary.webp"
          alt=""
          style={{ ...imgStyle, opacity: prayer === "mary" ? 1 : 0 }}
        />
      </div>
    </div>
  );
}

function Defs() {
  return (
    <defs>
      <radialGradient id="upActive" cx="50%" cy="50%" r="50%">
        <stop offset="0%" style={{ stopColor: "var(--accent-glow)" }} />
        <stop offset="100%" style={{ stopColor: "var(--accent)" }} />
      </radialGradient>
      <filter id="upGlow" x="-300%" y="-300%" width="700%" height="700%">
        <feGaussianBlur stdDeviation="5" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

function Beads({ beads }: { beads: Bead[] }) {
  return (
    <>
      {beads.map((b, i) => (
        <circle
          key={i}
          cx={b.x}
          cy={b.y}
          r={b.r}
          fill={b.fill}
          opacity={b.opacity}
          filter={b.glow ? "url(#upGlow)" : undefined}
          style={{
            transition: `r .35s ${EASE}, opacity .35s ease, fill .35s ease`,
          }}
        />
      ))}
    </>
  );
}

export type BeadVisualProps = {
  step: Step | undefined;
  style: BeadStyle;
  prayer: PrayerId;
  lang: Lang;
  /** 0–1 through the whole rosary; drives the gold progress stroke. */
  progress: number;
};

export default function BeadVisual({
  step,
  style,
  prayer,
  lang,
  progress,
}: BeadVisualProps) {
  const beads = beadGeometry(step, style, prayer);
  const dash = `${(progress * DASH_LENGTH[style]).toFixed(1)} 9999`;
  // The arc and ring read right-to-left in Arabic, so mirror the whole group.
  const flip = lang === "ar" ? "translate(400,0) scale(-1,1)" : undefined;
  const track = "rgba(255,255,255,.09)";
  const lit = "rgb(var(--accent-rgb) / .5)";
  const strokeAnim = { transition: `stroke-dasharray .55s ${EASE}` };

  if (style === "orb") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
          padding: "26px 0 6px",
        }}
      >
        <div
          style={{
            position: "relative",
            width: 172,
            height: 172,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Centre size={132} haloScale={172 / 132} prayer={prayer} />
          <div
            style={{
              position: "absolute",
              inset: -6,
              borderRadius: "50%",
              border: "1px solid rgb(var(--accent-rgb) / .25)",
              animation: "upOrb 4.5s ease-in-out infinite",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: 7,
            maxWidth: 280,
          }}
        >
          {beads.map((b, i) => (
            <div
              key={i}
              style={{
                borderRadius: "50%",
                width: b.dot,
                height: b.dot,
                background: b.dotBg,
                opacity: b.opacity,
                transition:
                  "width .3s ease,height .3s ease,background .3s ease,opacity .3s ease",
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (style === "ring") {
    return (
      <div style={{ position: "relative", padding: "4px 0 0" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <Centre size={112} haloScale={150 / 112} prayer={prayer} />
        </div>
        <svg
          viewBox="0 0 400 300"
          style={{
            position: "relative",
            width: "100%",
            display: "block",
            overflow: "visible",
          }}
        >
          <Defs />
          <g transform={flip}>
            <circle
              cx={200}
              cy={150}
              r={118}
              fill="none"
              stroke={track}
              strokeWidth={1.5}
            />
            <circle
              cx={200}
              cy={150}
              r={118}
              fill="none"
              stroke={lit}
              strokeWidth={1.5}
              strokeLinecap="round"
              transform="rotate(-90 200 150)"
              strokeDasharray={dash}
              style={strokeAnim}
            />
            <Beads beads={beads} />
          </g>
        </svg>
      </div>
    );
  }

  if (style === "chain") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          padding: "16px 0 0",
        }}
      >
        <Centre size={100} haloScale={126 / 100} prayer={prayer} />
        <svg
          viewBox="0 0 400 90"
          style={{ width: "100%", display: "block", overflow: "visible" }}
        >
          <Defs />
          <g transform={flip}>
            <path d="M24 45 H376" fill="none" stroke={track} strokeWidth={1.5} />
            <path
              d="M24 45 H376"
              fill="none"
              stroke={lit}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeDasharray={dash}
              style={strokeAnim}
            />
            <Beads beads={beads} />
          </g>
        </svg>
      </div>
    );
  }

  // arc — the default
  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          position: "absolute",
          insetInline: 0,
          top: 14,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <Centre size={118} haloScale={150 / 118} prayer={prayer} />
      </div>
      <svg
        viewBox="0 0 400 205"
        style={{
          position: "relative",
          width: "100%",
          display: "block",
          overflow: "visible",
        }}
      >
        <Defs />
        <g transform={flip}>
          <path
            d="M35.6 160.1 A175 175 0 0 1 364.4 160.1"
            fill="none"
            stroke={track}
            strokeWidth={1.5}
          />
          <path
            d="M35.6 160.1 A175 175 0 0 1 364.4 160.1"
            fill="none"
            stroke={lit}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeDasharray={dash}
            style={strokeAnim}
          />
          <Beads beads={beads} />
        </g>
      </svg>
    </div>
  );
}
