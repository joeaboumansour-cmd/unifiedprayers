"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import Completion from "@/components/Completion";
import { type Lang, ui } from "@/lib/content";
import { playGlimmer, playReveal, resetGlimmer } from "@/lib/glimmer";
import type { Devotion } from "@/lib/useDevotions";

const EASE = "cubic-bezier(.22,1,.36,1)";

/* --------------------------------- words --------------------------------- */

/**
 * A line of text whose words land one after another.
 *
 * Words, not letters. Letters are the obvious unit for a "characters
 * spawning" effect and they are the wrong one here: Arabic is cursive, and a
 * letter given its own element loses its joins to the letters either side and
 * renders in isolated form — the text stops being readable as it animates in.
 * A word is the smallest piece that survives shaping, so it is the unit.
 *
 * The stagger is capped rather than proportional. A twelve-word verse should
 * feel like it is being written; a ninety-word paragraph animating at the same
 * per-word delay would take most of a minute to finish arriving.
 *
 * No `will-change` on the words. It is the obvious thing to add to an animated
 * transform and it is wrong here: a page is hundreds of these elements, and
 * a hint that never comes off would hold hundreds of compositing layers for as
 * long as the page is open. The browser promotes what it needs for the second
 * the animation runs, and lets go of it afterwards.
 */
function Words({
  text,
  delay = 0,
  step = 26,
  cap = 900,
  style,
}: {
  text: string;
  /** Milliseconds before the first word. */
  delay?: number;
  /** Milliseconds between words. */
  step?: number;
  /** The most any one word will wait, so long paragraphs stay readable. */
  cap?: number;
  style?: React.CSSProperties;
}) {
  // Split on whitespace but keep the separators, so the original spacing —
  // including the line breaks inside a quotation — survives the round trip.
  const parts = useMemo(() => text.split(/(\s+)/), [text]);
  let n = 0;

  return (
    <span style={style}>
      {parts.map((part, i) => {
        if (!part) return null;
        // A run of whitespace is rendered as itself, outside any animated
        // element: an inline-block holding a trailing space would not collapse
        // or wrap the way the surrounding text does.
        if (/^\s+$/.test(part)) {
          return part.includes("\n") ? <br key={i} /> : <span key={i}> </span>;
        }
        const at = delay + Math.min(n * step, cap);
        n += 1;
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              animation: `devWord .55s ${EASE} ${at}ms both`,
            }}
          >
            {part}
          </span>
        );
      })}
    </span>
  );
}

/* -------------------------------- sparkles -------------------------------- */

type Grain = {
  left: number;
  top: number;
  dx: number;
  dy: number;
  size: number;
  delay: number;
  life: number;
  star: boolean;
};

/**
 * A burst of light across the page.
 *
 * Laid out once per burst and then left entirely to the compositor: every
 * grain animates only transform and opacity, off a single CSS keyframe, with
 * its own travel passed in as custom properties. Nothing here runs per frame.
 */
function Sparkles({ count, spread }: { count: number; spread: number }) {
  const grains = useMemo<Grain[]>(
    () =>
      Array.from({ length: count }, () => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        dx: (Math.random() - 0.5) * spread,
        // Biased upward: light that drifts up reads as rising rather than
        // falling, and falling is what dust does.
        dy: -Math.random() * spread * 0.9 - 8,
        size: 2 + Math.random() * 8,
        delay: Math.random() * 560,
        life: 900 + Math.random() * 1100,
        star: Math.random() < 0.45,
      })),
    [count, spread],
  );

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 3,
      }}
    >
      {/* The wash the grains come out of, so a burst reads as one event
          rather than as forty unrelated dots. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "42%",
          width: 460,
          height: 460,
          marginLeft: -230,
          marginTop: -230,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgb(var(--accent-soft-rgb) / .3), transparent 66%)",
          animation: `devFlash 1.1s ${EASE} forwards`,
        }}
      />
      {grains.map((g, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${g.left}%`,
            top: `${g.top}%`,
            width: g.size,
            height: g.size,
            background: "var(--sparkle)",
            borderRadius: g.star ? 0 : "50%",
            clipPath: g.star
              ? "polygon(50% 0%, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0% 50%, 39% 39%)"
              : undefined,
            boxShadow: g.star
              ? undefined
              : `0 0 ${g.size * 2}px rgb(var(--accent-rgb) / .75)`,
            opacity: 0,
            ["--dx" as string]: `${g.dx}px`,
            ["--dy" as string]: `${g.dy}px`,
            animation: `devSparkle ${g.life}ms ${EASE} ${g.delay}ms forwards`,
          }}
        />
      ))}
    </div>
  );
}

/* --------------------------------- blocks --------------------------------- */

type Block =
  | { kind: "head" }
  | { kind: "verse" }
  | { kind: "para"; text: string }
  | { kind: "quote" };

function blocksFor(d: Devotion): Block[] {
  return [
    { kind: "head" },
    { kind: "verse" },
    ...d.paragraphs.map((text) => ({ kind: "para", text }) as Block),
    ...(d.quote ? [{ kind: "quote" } as Block] : []),
  ];
}

/* --------------------------------- reader --------------------------------- */

/** Chrome, not prayer text — the same reason the tab labels are not in the
    content document either. Everything a reader actually reads comes from
    `t.devotion`. */
const CLOSE = { ar: "إغلاق", en: "Close" } as const;

export type DevotionReaderProps = {
  /** Null when nothing is open. Kept mounted so the overlay can slide away. */
  devotion: Devotion | null;
  open: boolean;
  lang: Lang;
  /** The date line under the title — already formatted by the caller. */
  dateLine: string;
  trackLabel: string;
  /**
   * Blocks to open with. 1 is a sealed page; anything more resumes one that was
   * put down part-way. Read once per opening, not tracked afterwards.
   */
  startAt?: number;
  /** Every reveal, so closing the reader never loses the place. */
  onProgress: (shown: number, total: number) => void;
  /** Called once, when the last block has been tapped past. */
  onComplete: () => void;
  onClose: () => void;
};

/**
 * One page of a devotional, uncovered a tap at a time.
 *
 * The whole surface is the button. A page opens showing its date and title and
 * nothing else; each tap adds the next piece — the verse, then one paragraph,
 * then the closing quotation — and the tap after the last one hands over to the
 * same closing tick a finished rosary gets.
 *
 * Nothing advances on a timer. The reading pace is the reader's, and a
 * paragraph that appears while someone is still on the one above it is an
 * interruption rather than a reveal.
 */
export default function DevotionReader({
  devotion,
  open,
  lang,
  dateLine,
  trackLabel,
  startAt = 1,
  onProgress,
  onComplete,
  onClose,
}: DevotionReaderProps) {
  const t = ui(lang);
  const d = t.devotion;
  const ar = lang === "ar";

  const [shown, setShown] = useState(1);
  const [burst, setBurst] = useState(0);
  const [done, setDone] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);

  // Held so the last page stays painted while the overlay slides away, rather
  // than blanking the instant the caller clears its selection.
  const held = useRef<Devotion | null>(devotion);
  if (devotion) held.current = devotion;
  const page = devotion ?? held.current;

  const blocks = useMemo(() => (page ? blocksFor(page) : []), [page]);

  /* Every opening re-seals the page, or re-opens it where it was left.
     Keyed on `open` as well as the id, and that is the whole point: someone
     re-reading the devotion they finished this morning opens the same row, so
     the id alone never changes and the reader would come back up fully
     uncovered with the closing tick still over it. Closing falls out of the
     guard rather than resetting, so the finished page is what slides away.

     `startAt` is read here rather than tracked, so revealing a block — which
     tells the caller, which changes startAt — cannot reset the page underneath
     the reader. */
  useEffect(() => {
    if (!open) return;
    setShown(Math.max(1, Math.min(startAt, blocks.length || 1)));
    setDone(false);
    setBurst((b) => b + 1);
    // The sound of the page being unsealed, under the big opening burst. The
    // reveals after it climb a scale, and a new page starts that climb again
    // from the bottom.
    resetGlimmer();
    playReveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, devotion?.id]);

  // Each reveal appends below the fold. Scrolling to it is the difference
  // between "something appeared" and "something appeared where I am looking".
  useEffect(() => {
    if (shown <= 1) return;
    const el = scroller.current;
    if (!el) return;
    // After paint, so the new block's height is in the scroll extent.
    const id = requestAnimationFrame(() =>
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }),
    );
    return () => cancelAnimationFrame(id);
  }, [shown]);

  const atEnd = shown >= blocks.length;

  const advance = () => {
    if (done) return;
    if (atEnd) {
      setDone(true);
      onComplete();
      return;
    }
    // A smaller version of the opening sound, one step higher each time, so
    // the page sounds like it is being uncovered rather than clicked through.
    playGlimmer();
    const next = shown + 1;
    setShown(next);
    setBurst((b) => b + 1);
    // Reported per reveal rather than on close, because a reader who closes
    // the app rather than the page never fires a close.
    onProgress(next, blocks.length);
  };

  /* A tap, not a drag. The page scrolls, so a finger that travelled is
     someone reading what is already there rather than asking for more. */
  const down = useRef({ x: 0, y: 0, t: 0 });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") {
        e.preventDefault();
        if (done) onClose();
        else advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const hint = !page
    ? ""
    : shown === 1
      ? d.tapVerse
      : atEnd
        ? d.tapDone
        : blocks[shown]?.kind === "quote"
          ? d.tapQuote
          : d.tapNext;

  return (
    <div
      role="dialog"
      aria-modal={open}
      aria-label={page?.title ?? trackLabel}
      onPointerDown={(e) => {
        down.current = { x: e.clientX, y: e.clientY, t: Date.now() };
      }}
      onPointerUp={(e) => {
        const s = down.current;
        if (Date.now() - s.t > 700) return;
        if (Math.abs(e.clientX - s.x) > 10 || Math.abs(e.clientY - s.y) > 10) return;
        advance();
      }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        background: "var(--grad-player)",
        transition: `transform .52s ${EASE}, opacity .3s ease`,
        transform: open ? "translateY(0)" : "translateY(100%)",
        opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
        cursor: "pointer",
      }}
      aria-hidden={!open}
    >
      {/* Remounted per burst — a keyframe restarts when the element is new,
          and a burst is a new element by design. */}
      {open && !done && (
        <Sparkles
          key={burst}
          /* The opening burst is the big one: it is the moment the page is
             unsealed, and it should read as the room lighting up. Every reveal
             after it gets a smaller handful, so the page keeps glinting without
             the first tap being outdone by the fourth. */
          count={shown === 1 ? 110 : 38}
          spread={shown === 1 ? 250 : 160}
        />
      )}

      {/* header */}
      <div
        style={{
          flex: "none",
          zIndex: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "calc(16px + var(--safe-t)) 16px 6px",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "var(--accent-ink)",
          }}
        >
          {trackLabel}
        </div>
        <button
          type="button"
          aria-label={CLOSE[lang]}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          style={{
            flex: "none",
            width: 34,
            height: 34,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgb(var(--veil-rgb) / .06)",
            border: "1px solid rgb(var(--veil-rgb) / .09)",
            color: "var(--soft)",
          }}
        >
          <svg viewBox="0 0 20 20" style={{ width: 14, height: 14 }}>
            <path
              d="M5 5 L15 15 M15 5 L5 15"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* the page */}
      <div
        ref={scroller}
        className="scroll-y"
        style={{
          flex: 1,
          minHeight: 0,
          zIndex: 4,
          padding: "10px 24px 8px",
          animation: open ? `devOpen .5s ${EASE} both` : "none",
        }}
      >
        {page && (
          <div
            className="selectable"
            dir={ar ? "rtl" : "ltr"}
            style={{ display: "flex", flexDirection: "column", gap: 26 }}
          >
            {/* date + title — on screen from the moment the page opens */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12.5, color: "var(--dim)" }}>{dateLine}</div>
              <Words
                text={page.title}
                delay={140}
                step={70}
                style={{
                  fontSize: 26,
                  fontWeight: 600,
                  lineHeight: 1.4,
                  letterSpacing: "-.01em",
                  color: "var(--ink)",
                }}
              />
              <div
                style={{
                  height: 1,
                  transformOrigin: ar ? "right" : "left",
                  background:
                    "linear-gradient(90deg, rgb(var(--accent-rgb) / .55), transparent)",
                  animation: `devRule .8s ${EASE} .45s both`,
                }}
              />
            </div>

            {blocks.slice(1, shown).map((b, i) => {
              // The block index in the full list, so a key survives the slice.
              const key = `${i}-${b.kind}`;
              if (b.kind === "verse") {
                return (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      padding: "18px 18px",
                      borderRadius: 20,
                      background:
                        "linear-gradient(150deg,rgb(var(--accent-rgb) / .1),rgb(var(--accent-rgb) / .03))",
                      border: "1px solid rgb(var(--accent-rgb) / .18)",
                    }}
                  >
                    <Words
                      text={page.verse}
                      step={34}
                      style={{
                        fontSize: 16.5,
                        lineHeight: 1.95,
                        fontWeight: 500,
                        color: "var(--accent-text)",
                      }}
                    />
                    {page.verseRef && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--dim)",
                          animation: `devWord .5s ${EASE} .5s both`,
                        }}
                      >
                        {page.verseRef}
                      </div>
                    )}
                  </div>
                );
              }

              if (b.kind === "para") {
                return (
                  <Words
                    key={key}
                    text={b.text}
                    step={22}
                    style={{
                      fontSize: 16,
                      lineHeight: 2.05,
                      fontWeight: 300,
                      color: "var(--body)",
                    }}
                  />
                );
              }

              return (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    paddingInlineStart: 16,
                    borderInlineStart: "2px solid rgb(var(--accent-rgb) / .4)",
                  }}
                >
                  <Words
                    text={page.quote ?? ""}
                    step={30}
                    style={{
                      fontSize: 15.5,
                      lineHeight: 1.95,
                      fontStyle: "italic",
                      color: "var(--soft-2)",
                    }}
                  />
                  {page.quoteSource && (
                    <div
                      style={{
                        fontSize: 12.5,
                        color: "var(--accent-ink)",
                        animation: `devWord .5s ${EASE} .6s both`,
                      }}
                    >
                      — {page.quoteSource} —
                    </div>
                  )}
                </div>
              );
            })}

            {/* Room under the last block so the hint never sits on the text. */}
            <div style={{ height: 8 }} />
          </div>
        )}
      </div>

      {/* the prompt */}
      <div
        style={{
          flex: "none",
          zIndex: 4,
          padding: "6px 24px max(20px, var(--safe-b))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          fontSize: 12,
          color: "var(--dim)",
          animation: done ? "none" : "devWait 2.6s ease-in-out infinite",
          opacity: done ? 0 : undefined,
        }}
      >
        {/* How much of the page is left, as dots. Reading a devotion should
            not feel open-ended when it is in fact eight taps long. */}
        <div style={{ display: "flex", gap: 4 }}>
          {blocks.map((_, i) => (
            <div
              key={i}
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                background:
                  i < shown ? "var(--accent)" : "rgb(var(--veil-rgb) / .16)",
                transition: `background .4s ${EASE}`,
              }}
            />
          ))}
        </div>
        <span>{hint}</span>
      </div>

      {/* Above the sparkle layer and the page, both of which set a stacking
          order of their own. Completion pins itself to this wrapper. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 6,
          pointerEvents: done ? "auto" : "none",
        }}
      >
        <Completion
          open={done}
          lang={lang}
          title={t.doneTitle}
          note={d.doneNote}
          onDismiss={onClose}
        />
      </div>
    </div>
  );
}
