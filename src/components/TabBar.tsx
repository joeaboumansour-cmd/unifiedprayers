"use client";

import { type Lang, ui } from "@/lib/content";

const EASE = "cubic-bezier(.22,1,.36,1)";
/** Each tab's glyph is the same circle pair at different radii. */
const RADII: [number, number][] = [
  [8, 2.6],
  [8.5, 0],
  [7, 3.4],
  [9, 1.6],
  [6, 5],
];

/** Named here rather than in design.json — see the note in Home.tsx. */
const ADMIN_LABEL = { ar: "الإدارة", en: "Admin" } as const;

export default function TabBar({
  tab,
  lang,
  hidden,
  isAdmin,
  onSelect,
}: {
  tab: number;
  lang: Lang;
  hidden: boolean;
  /** Appends the admin tab. Nothing behind it trusts this flag. */
  isAdmin: boolean;
  onSelect: (i: number) => void;
}) {
  const t = ui(lang);
  // The four names come from the content document, which an admin can edit; a
  // fifth entry added there would appear here with no tab body behind it, so
  // the list is cut to the panels that exist before the admin one is added.
  const labels = [...t.tabs.slice(0, 4), ...(isAdmin ? [ADMIN_LABEL[lang]] : [])];
  return (
    <nav
      style={{
        position: "absolute",
        insetInline: 0,
        bottom: 0,
        padding: "8px 14px var(--tab-pad-b)",
        display: "flex",
        gap: 4,
        background:
          "linear-gradient(rgb(var(--bg-base-rgb) / 0),rgb(var(--bg-base-rgb) / .86) 40%,rgb(var(--bg-base-rgb) / .97))",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderTop: "1px solid rgba(255,255,255,.06)",
        transition: `transform .5s ${EASE}, opacity .35s ease`,
        transform: hidden ? "translateY(120%)" : "translateY(0)",
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? "none" : "auto",
      }}
      aria-hidden={hidden}
    >
      {labels.map((label, i) => {
        const ink = i === tab ? "var(--accent)" : "var(--dim-3)";
        const [r1, r2] = RADII[i];
        return (
          <button
            key={label}
            type="button"
            onClick={() => onSelect(i)}
            aria-current={i === tab ? "page" : undefined}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 5,
              padding: "7px 0 var(--tab-btn-pad-b)",
            }}
          >
            <svg viewBox="0 0 22 22" style={{ width: 21, height: 21 }}>
              <circle
                cx="11"
                cy="11"
                r={r1}
                fill="none"
                stroke={ink}
                strokeWidth={1.4}
              />
              {r2 > 0 && <circle cx="11" cy="11" r={r2} fill={ink} />}
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
