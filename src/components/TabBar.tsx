"use client";

import type { ReactNode } from "react";

const EASE = "cubic-bezier(.22,1,.36,1)";

/**
 * The tab names, in English whatever the app's language, like the Settings and
 * Admin screens two of them lead to. Named here rather than read from the
 * content document: they are chrome, not prayer text, and a list an admin can
 * edit could grow a fifth name with no tab behind it.
 */
const LABELS = ["Home", "Today", "Calendar", "Settings"];
const ADMIN_LABEL = "Admin";

/**
 * One glyph per tab, drawn for what the tab holds. Thin strokes on a 24-unit
 * grid, the same weight throughout so five different pictures still read as
 * one set; the active tab takes the accent and a faint wash of it inside the
 * shape, and nothing moves.
 */
const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Home, where the prayers are: a rosary — a loop of beads, and the cross it ends in. */
function Rosary({ on }: { on: boolean }) {
  return (
    <>
      {/* A dotted circle is a circle of beads: zero-length dashes with round
          caps draw as dots, spaced evenly round the loop. */}
      <circle cx="12" cy="8.6" r="5.6" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeDasharray="0 3.08" />
      {on && <circle cx="12" cy="8.6" r="3.4" fill="currentColor" opacity={0.16} />}
      <path d="M12 14.2v1.6M12 16.9v5.3M9.8 18.7h4.4" {...STROKE} />
    </>
  );
}

/** Today: the sun coming up over the horizon. */
function Sunrise({ on }: { on: boolean }) {
  return (
    <>
      {on && <path d="M7 16.5a5 5 0 0 1 10 0Z" fill="currentColor" opacity={0.18} />}
      <path d="M7 16.5a5 5 0 0 1 10 0" {...STROKE} />
      <path d="M3.5 16.5h17M8 20h8M12 6.2v2.1M5.9 8.9l1.4 1.4M18.1 8.9l-1.4 1.4" {...STROKE} />
    </>
  );
}

/** Calendar: a page of the church's year, marked with its cross. */
function Calendar({ on }: { on: boolean }) {
  return (
    <>
      {on && <rect x="4" y="5.5" width="16" height="15" rx="3" fill="currentColor" opacity={0.14} />}
      <rect x="4" y="5.5" width="16" height="15" rx="3" {...STROKE} />
      <path d="M8.5 3.5v4M15.5 3.5v4M4 10h16M12 12.3v5.6M9.7 14.4h4.6" {...STROKE} />
    </>
  );
}

/** Settings: three sliders, each set somewhere different. */
function Sliders({ on }: { on: boolean }) {
  const knob = (cx: number, cy: number) => (
    <circle cx={cx} cy={cy} r="2" fill={on ? "currentColor" : "none"} fillOpacity={on ? 0.2 : undefined} stroke="currentColor" strokeWidth={1.5} />
  );
  return (
    <>
      <path d="M4 7h4M12 7h8M4 12h9M17 12h3M4 17h2M10 17h10" {...STROKE} />
      {knob(10, 7)}
      {knob(15, 12)}
      {knob(8, 17)}
    </>
  );
}

/** Admin: a shield. */
function Shield({ on }: { on: boolean }) {
  const d = "M12 3.5 18.5 6v5.3c0 4.1-2.7 7.5-6.5 9.2-3.8-1.7-6.5-5.1-6.5-9.2V6Z";
  return (
    <>
      {on && <path d={d} fill="currentColor" opacity={0.14} />}
      <path d={d} {...STROKE} />
      <path d="m9.4 12.2 1.8 1.8 3.5-3.6" {...STROKE} />
    </>
  );
}

const GLYPHS: ((p: { on: boolean }) => ReactNode)[] = [Rosary, Sunrise, Calendar, Sliders, Shield];

export default function TabBar({
  tab,
  at,
  dragging,
  hidden,
  isAdmin,
  onSelect,
}: {
  tab: number;
  /**
   * Where the pages actually are, as a fractional tab index. Equal to `tab`
   * at rest and somewhere in between while a finger is dragging them, so the
   * chip travels with the pages rather than jumping once they land.
   */
  at: number;
  /** A finger is on the pages right now, so the chip drops its easing. */
  dragging: boolean;
  hidden: boolean;
  /** Appends the admin tab. Nothing behind it trusts this flag. */
  isAdmin: boolean;
  onSelect: (i: number) => void;
}) {
  const labels = [...LABELS, ...(isAdmin ? [ADMIN_LABEL] : [])];
  const n = labels.length;
  /* The chip's own width, and the step from one seat to the next. The capsule
     is padded 6 all round and the buttons are 2 apart, so neither is simply
     `100% / n`. */
  const seat = `((100% - 12px - ${(n - 1) * 2}px) / ${n})`;
  // Clamped: the track rubber-bands past the ends and the chip must not.
  const slot = Math.max(0, Math.min(n - 1, at));
  return (
    <nav
      // Left to right in both languages. The labels are English either way,
      // and a bar that reversed with the language put Prayers under a
      // different thumb depending on a setting; one layout is one habit.
      dir="ltr"
      style={{
        position: "absolute",
        insetInline: "var(--tab-inline)",
        bottom: "var(--tab-float-b)",
        padding: 6,
        display: "flex",
        gap: 2,
        // A capsule, not a shelf. Clear of every edge, so the page runs on
        // underneath it and the blur has something to soften.
        borderRadius: 999,
        // Thin enough to read what is behind it, opaque enough to keep the
        // labels legible over a bright card scrolling past.
        background: "rgb(var(--bg-base-rgb) / .58)",
        // The saturation is what keeps the ground from going grey under the
        // blur; without it a translucent dark bar drains the colour it sits on.
        backdropFilter: "blur(22px) saturate(170%)",
        WebkitBackdropFilter: "blur(22px) saturate(170%)",
        border: "1px solid rgb(var(--veil-rgb) / .1)",
        boxShadow:
          "0 10px 30px rgb(var(--shadow-rgb) / var(--shadow-a)), inset 0 1px 0 rgb(var(--veil-rgb) / .05)",
        transition: `transform .5s ${EASE}, opacity .35s ease`,
        // Far enough to clear its own height, the gap beneath it, and the
        // shadow that trails it.
        transform: hidden
          ? "translateY(calc(100% + var(--tab-float-b) + 24px))"
          : "translateY(0)",
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? "none" : "auto",
      }}
      aria-hidden={hidden}
    >
      {/* The chip the active tab sits in, as one element that moves rather
          than a background lit on whichever button is current: it has to be
          able to be between two of them while a page is being dragged. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 6,
          bottom: 6,
          left: 6,
          width: `calc(${seat})`,
          /* Moved on a transform rather than `left`: a percentage here is of
             the chip's own width, which is exactly one seat, so the step from
             one tab to the next is a seat plus the 2px between buttons and
             needs to know nothing about the capsule around it. It also runs
             on the compositor, which is what keeps it pinned to the finger. */
          transform: `translateX(calc(${slot} * (100% + 2px)))`,
          borderRadius: 999,
          background: "rgb(var(--accent-rgb) / .13)",
          // No easing while a finger is on it: the position it is being handed
          // already follows the finger, and easing on top of that only lags.
          transition: dragging ? "none" : `transform .42s ${EASE}`,
        }}
      />
      {labels.map((label, i) => {
        /* Which tab is lit follows the chip rather than the settled `tab`, so
           the icon and its label take the accent as the chip reaches them —
           halfway through a drag — instead of a beat later when the page
           lands. */
        const on = i === Math.round(slot);
        const ink = on ? "var(--accent)" : "var(--dim-3)";
        const Glyph = GLYPHS[i];
        return (
          <button
            key={label}
            type="button"
            onClick={() => onSelect(i)}
            aria-current={on ? "page" : undefined}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "6px 0",
              color: ink,
              // Above the chip, which is drawn behind all of them.
              position: "relative",
              /* The press scale is named here as well as in globals.css:
                 an inline `transition` replaces the whole list, so a button
                 that sets one of its own drops the press easing and snaps
                 back instead of rising. */
              transition: `color .25s ease, scale var(--t-rise) var(--ease-out)`,
            }}
          >
            <svg viewBox="0 0 24 24" style={{ width: 21, height: 21 }} aria-hidden="true">
              <Glyph on={on} />
            </svg>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 500,
                color: ink,
                lineHeight: "var(--tab-label-lh)",
              }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
