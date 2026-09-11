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
  hidden,
  isAdmin,
  onSelect,
}: {
  tab: number;
  hidden: boolean;
  /** Appends the admin tab. Nothing behind it trusts this flag. */
  isAdmin: boolean;
  onSelect: (i: number) => void;
}) {
  const labels = [...LABELS, ...(isAdmin ? [ADMIN_LABEL] : [])];
  return (
    <nav
      // Left to right in both languages. The labels are English either way,
      // and a bar that reversed with the language put Prayers under a
      // different thumb depending on a setting; one layout is one habit.
      dir="ltr"
      style={{
        position: "absolute",
        insetInline: 0,
        bottom: 0,
        padding: "8px 14px var(--tab-pad-b)",
        display: "flex",
        gap: 4,
        // --tab-bg is set only where iOS leaves a strip under the page
        // (globals.css); everywhere else the bar is the translucent gradient
        // it always was.
        background:
          "var(--tab-bg, linear-gradient(rgb(var(--bg-base-rgb) / 0),rgb(var(--bg-base-rgb) / .86) 40%,rgb(var(--bg-base-rgb) / .97)))",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderTop: "1px solid rgb(var(--veil-rgb) / .06)",
        transition: `transform .5s ${EASE}, opacity .35s ease`,
        transform: hidden ? "translateY(120%)" : "translateY(0)",
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? "none" : "auto",
      }}
      aria-hidden={hidden}
    >
      {labels.map((label, i) => {
        const on = i === tab;
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
              gap: 5,
              padding: "7px 0 var(--tab-btn-pad-b)",
              color: ink,
              transition: "color .25s ease",
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
