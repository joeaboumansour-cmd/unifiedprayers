"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import BeadVisual from "@/components/BeadVisual";
import Completion from "@/components/Completion";
import {
  type BeadStyle,
  type Lang,
  type MysteryKey,
  type PrayerId,
  setLabel,
  ui,
} from "@/lib/content";
import type { Step } from "@/lib/steps";

const EASE = "cubic-bezier(.22,1,.36,1)";
const TEXT_SIZES = [0.9, 1, 1.14];

export type PlayerProps = {
  open: boolean;
  steps: Step[];
  step: number;
  prayer: PrayerId;
  mysterySet: MysteryKey;
  lang: Lang;
  beadStyle: BeadStyle;
  size: number;
  dim: boolean;
  audio: boolean;
  fading: boolean;
  done: boolean;
  onAdvance: () => void;
  onBack: () => void;
  onClose: () => void;
  onToggleDim: () => void;
  onToggleAudio: () => void;
  onFinish: () => void;
};

export default function Player({
  open,
  steps,
  step,
  prayer,
  mysterySet,
  lang,
  beadStyle,
  size,
  dim,
  audio,
  fading,
  done,
  onAdvance,
  onBack,
  onClose,
  onToggleDim,
  onToggleAudio,
  onFinish,
}: PlayerProps) {
  const t = ui(lang);
  const ar = lang === "ar";
  const total = steps.length;
  const cur = steps[Math.min(step, total - 1)];
  const progress = total > 1 ? step / (total - 1) : 0;

  const units = cur?.kind === "bead" ? (cur.units ?? 7) : prayer === "mary" ? 5 : 7;
  const unit = cur?.kind === "bead" ? (cur.unit ?? -1) : -1;

  const pips = useMemo(
    () =>
      Array.from({ length: units }, (_, i) => {
        const state = unit < 0 ? 0 : i < unit ? 2 : i === unit ? 1 : 0;
        return {
          w: state === 1 ? 26 : 11,
          bg:
            state === 1
              ? "var(--accent)"
              : state === 2
                ? "rgb(var(--accent-rgb) / .45)"
                : "rgba(255,255,255,.14)",
        };
      }),
    [units, unit],
  );

  /* Swipe as an alternative to tapping, so a stray drag never skips a bead. */
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  /* A drag is followed by a click, and its x is where the finger lifted — the
     other half of the screen. Left alone that click would undo the swipe, so
     the touch is remembered and a click that lands away from where the finger
     went down is discarded. A tap lands within a few pixels of its own start. */
  const down = useRef<{ x: number; t: number } | null>(null);

  /* The arrows are the only thing on screen that says the halves are tappable,
     so they answer a tap: the side that was used lights up for a moment. */
  const [flash, setFlash] = useState<"back" | "fwd" | null>(null);
  const flashTimer = useRef<number | null>(null);
  useEffect(() => () => window.clearTimeout(flashTimer.current ?? 0), []);

  /* And they introduce themselves once, as the player slides up. */
  const [intro, setIntro] = useState(false);
  useEffect(() => {
    if (!open) return;
    setIntro(true);
    const id = window.setTimeout(() => setIntro(false), 1900);
    return () => window.clearTimeout(id);
  }, [open]);

  const canBack = step > 0;

  const go = (forward: boolean) => {
    if (done || (!forward && !canBack)) return;
    setFlash(forward ? "fwd" : "back");
    window.clearTimeout(flashTimer.current ?? 0);
    flashTimer.current = window.setTimeout(() => setFlash(null), 300);
    if (forward) onAdvance();
    else onBack();
  };

  /* The body scroller must not swallow taps meant to advance. */
  const textRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    textRef.current?.scrollTo({ top: 0 });
  }, [step]);

  const fadeStyle = {
    opacity: fading ? 0 : 1,
    transform: fading ? "translateY(8px)" : "translateY(0)",
  };

  const round = (on: boolean): React.CSSProperties => ({
    width: 34,
    height: 34,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: on ? "rgb(var(--accent-rgb) / .18)" : "rgba(255,255,255,.07)",
    border: "1px solid rgba(255,255,255,.09)",
    flex: "none",
  });

  /* The arrows are a signpost, not the control: the whole half of the screen
     they sit in is tappable, so they stay quiet until they are used. They are
     still real buttons, so the affordance also works with a keyboard. */
  const arrow = (side: "back" | "fwd") => {
    const lit = flash === side;
    const muted = side === "back" && !canBack;
    // Back points to the start of the reading direction, forward to its end.
    const pointsLeft = side === "back" ? !ar : ar;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          go(side === "fwd");
        }}
        // Not from the design document: a remote copy of it replaces the whole
        // UI block, so a key added here would read as undefined on older rows.
        aria-label={side === "back" ? t.back : ar ? "التالي" : "Next"}
        disabled={muted}
        style={{
          width: 42,
          height: 42,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "none",
          background: lit ? "rgb(var(--accent-rgb) / .16)" : "transparent",
          // Lit wins over muted: a tap back onto the first step should still
          // show the arrow answering, not blink out mid-flash.
          opacity: lit ? 1 : muted ? 0.07 : intro ? 0.58 : 0.26,
          transition: "opacity .55s ease, background .3s ease",
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          aria-hidden
          style={{ transform: pointsLeft ? undefined : "scaleX(-1)" }}
        >
          <path
            d="M12.4 4.6 L6.6 10 L12.4 15.4"
            fill="none"
            stroke={lit ? "var(--accent)" : "var(--ink)"}
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    );
  };

  return (
    <div
      onClick={(e) => {
        if (done) return;
        const d = down.current;
        if (d && Date.now() - d.t < 1500 && Math.abs(e.clientX - d.x) > 30) return;
        /* A tap that ends a text selection is a reading gesture, not a turn. */
        const sel = window.getSelection?.();
        if (sel && !sel.isCollapsed) return;
        const r = e.currentTarget.getBoundingClientRect();
        const onRight = e.clientX - r.left > r.width / 2;
        // Forward lives at the end of the reading direction: right in Latin
        // script, left in Arabic — the same side a page turns towards.
        go(ar ? !onRight : onRight);
      }}
      onTouchStart={(e) => {
        if (done || e.touches.length !== 1) return void (touch.current = null);
        touch.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          t: Date.now(),
        };
        down.current = { x: touch.current.x, t: touch.current.t };
      }}
      onTouchEnd={(e) => {
        const s = touch.current;
        touch.current = null;
        if (!s || done) return;
        const dx = e.changedTouches[0].clientX - s.x;
        const dy = e.changedTouches[0].clientY - s.y;
        if (Date.now() - s.t > 700) return;
        if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
        // Asks the browser not to synthesise a click from a touch we handled.
        e.preventDefault();
        // In RTL, dragging rightward turns the page forward.
        go(ar ? dx > 0 : dx < 0);
      }}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--grad-player)",
        transition: `transform .52s ${EASE}`,
        transform: open ? "translateY(0)" : "translateY(100%)",
        cursor: "pointer",
      }}
      aria-hidden={!open}
    >
      {/* header */}
      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "calc(18px + var(--safe-t)) 16px 0",
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label={t.back}
          style={round(false)}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderTop: "1.5px solid var(--ink)",
              borderInlineStart: "1.5px solid var(--ink)",
              transform: ar ? "rotate(135deg)" : "rotate(-45deg)",
            }}
          />
        </button>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 500,
              color: "var(--soft)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {prayer === "mary" ? t.maryName : t.spiritName}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--accent)" }}>
            {prayer === "mary"
              ? setLabel(lang, mysterySet)
              : ar
                ? "المواهب السبع"
                : "Seven gifts"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 7 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleAudio();
            }}
            aria-label={t.toggles[2][0]}
            aria-pressed={audio}
            style={round(audio)}
          >
            <span
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 2,
                height: 13,
              }}
            >
              {[6, 12, 8].map((h, i) => (
                <span
                  key={i}
                  style={{
                    width: 2,
                    height: h,
                    borderRadius: 2,
                    background: audio ? "var(--accent)" : "var(--soft)",
                  }}
                />
              ))}
            </span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleDim();
            }}
            aria-label={t.toggles[0][0]}
            aria-pressed={dim}
            style={round(dim)}
          >
            <span
              style={{
                width: 13,
                height: 13,
                borderRadius: "50%",
                background: dim ? "var(--accent)" : "var(--soft)",
                boxShadow: "inset -4px 0 0 0 rgba(0,0,0,.55)",
              }}
            />
          </button>
        </div>
      </div>

      {/* beads */}
      <div style={{ flex: "none", position: "relative", padding: "6px 0 0" }}>
        <BeadVisual
          step={cur}
          style={beadStyle}
          prayer={prayer}
          lang={lang}
          progress={progress}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 7,
            marginTop: 2,
          }}
        >
          {pips.map((p, i) => (
            <div
              key={i}
              style={{
                height: 3,
                borderRadius: 999,
                width: p.w,
                background: p.bg,
                transition: "width .4s ease,background .4s ease",
              }}
            />
          ))}
        </div>
      </div>

      {/* prayer text */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 13,
          padding: "8px 26px 0",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "var(--accent)",
            flex: "none",
            transition: "opacity .3s ease",
            opacity: fading ? 0 : 1,
          }}
        >
          {cur?.kicker}
        </div>
        <div
          style={{
            fontSize: 17.5,
            fontWeight: 600,
            lineHeight: 1.5,
            letterSpacing: "-.01em",
            flex: "none",
            transition: `opacity .3s ease, transform .3s ${EASE}`,
            ...fadeStyle,
          }}
        >
          {cur?.title}
        </div>
        <div
          ref={textRef}
          className="scroll-y selectable"
          style={{
            fontSize: Math.round(17 * TEXT_SIZES[size]),
            fontWeight: 300,
            lineHeight: 2,
            color: "var(--body)",
            textWrap: "pretty",
            whiteSpace: "pre-line",
            /* Bounded by the flex parent rather than a vh figure: on iOS vh
               resolves against the large viewport, so 34vh overflowed the
               space that was really on screen. */
            flex: "0 1 auto",
            minHeight: 0,
            transition: `opacity .34s ease, transform .34s ${EASE}`,
            ...fadeStyle,
          }}
        >
          {cur?.text}
        </div>
      </div>

      {/* footer */}
      <div
        style={{
          flex: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          padding: "0 20px max(20px, var(--safe-b))",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            width: "100%",
          }}
        >
          {arrow("back")}
          <div
            style={{
              fontSize: 11.5,
              color: "var(--dim)",
              fontVariantNumeric: "tabular-nums",
              transition: "opacity .3s ease",
              opacity: fading ? 0 : 1,
              textAlign: "center",
              minWidth: 0,
            }}
          >
            {cur?.counter}
          </div>
          {arrow("fwd")}
        </div>
      </div>

      {/* the half that was tapped answers with a brief wash of light, so the
          mapping between a side of the screen and a direction is learnable */}
      {(["left", "right"] as const).map((p) => {
        const side = (p === "right") !== ar ? "fwd" : "back";
        return (
          <div
            key={p}
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: "40%",
              ...(p === "left" ? { left: 0 } : { right: 0 }),
              pointerEvents: "none",
              opacity: flash === side ? 1 : 0,
              transition: `opacity ${flash === side ? ".1s" : ".55s"} ease`,
              background: `linear-gradient(to ${p === "left" ? "right" : "left"},
                rgb(var(--accent-rgb) / .085), transparent)`,
            }}
          />
        );
      })}

      {/* night dim */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          transition: "opacity .6s ease",
          opacity: dim ? 1 : 0,
          background:
            "linear-gradient(rgba(60,26,0,.42),rgba(40,16,0,.5)),rgba(0,0,0,.28)",
        }}
      />

      {/* the closing moment sits above the dim, so the tick keeps its colour */}
      <Completion open={done} lang={lang} onDismiss={onFinish} />
    </div>
  );
}
