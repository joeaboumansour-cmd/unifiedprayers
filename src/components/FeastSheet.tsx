"use client";

import type { Lang } from "@/lib/content";
import {
  COLOUR_LABEL,
  RANK_LABEL,
  RITE_LABEL,
  colourVar,
  type Day,
  type Feast,
} from "@/lib/liturgy";
import { sheetMotion, useSheetDrag } from "@/lib/useSheetDrag";

const EASE = "cubic-bezier(.22,1,.36,1)";

/**
 * One feast, opened from the Calendar tab.
 *
 * Deliberately small. Everything here is already in the calendar table, so the
 * sheet opens for every entry rather than only the ones somebody has written a
 * paragraph about: date, rank, the vestment colour the grid's dot was showing,
 * and who keeps it. The note is the part that has to be written by hand, and a
 * feast without one still opens — it just says less.
 */
export default function FeastSheet({
  open,
  feast,
  day,
  lang,
  onClose,
}: {
  open: boolean;
  feast: Feast | null;
  day: Day | null;
  lang: Lang;
  onClose: () => void;
}) {
  const ar = lang === "ar";
  const drag = useSheetDrag(open, onClose);
  // Neutral on purpose: the same line has to sit under a woman, a man, and the
  // Exaltation of the Cross, so it cannot say "his life".
  const s = ar
    ? { read: "اقرأ المزيد على ويكيبيديا" }
    : { read: "Read more on Wikipedia" };

  const dateLine =
    day &&
    new Intl.DateTimeFormat(ar ? "ar" : "en", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(day.date);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--scrim)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          transition: "opacity .35s ease",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
      />
      <div
        role="dialog"
        aria-modal={open}
        aria-label={feast?.name ?? ""}
        style={{
          position: "absolute",
          insetInline: 0,
          bottom: 0,
          borderRadius: "28px 28px 0 0",
          background: "var(--surface)",
          borderTop: "1px solid rgb(var(--veil-rgb) / .1)",
          padding: "14px 18px max(24px, var(--safe-b))",
          boxShadow: "0 -20px 60px rgb(var(--shadow-rgb) / var(--shadow-a))",
          ...sheetMotion(open, drag, "105%", EASE),
          pointerEvents: open ? "auto" : "none",
        }}
      >
        <div
          {...drag.handlers}
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "4px 0 16px",
            margin: "-4px 0 0",
            cursor: "grab",
            touchAction: "none",
          }}
        >
          <div
            style={{
              width: 38,
              height: 4,
              borderRadius: 999,
              background: "rgb(var(--veil-rgb) / .22)",
            }}
          />
        </div>

        {/* Held mounted while the sheet slides away, so the text does not blink
            out before the panel has left the screen. */}
        {feast && (
          <>
            <div
              style={{
                fontSize: 11,
                letterSpacing: ".13em",
                textTransform: "uppercase",
                color: "var(--dim-3)",
              }}
            >
              {dateLine}
            </div>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                marginTop: 8,
              }}
            >
              <span
                style={{
                  flex: "none",
                  width: 4,
                  alignSelf: "stretch",
                  borderRadius: 2,
                  background: colourVar(feast.colour),
                }}
              />
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  lineHeight: 1.35,
                  letterSpacing: "-.01em",
                  textWrap: "balance",
                }}
              >
                {feast.name}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginTop: 14,
              }}
            >
              <Chip text={RANK_LABEL[feast.rank][lang]} />
              <Chip
                text={COLOUR_LABEL[feast.colour][lang]}
                dot={colourVar(feast.colour)}
              />
              {feast.rites.map((r) => (
                <Chip key={r} text={RITE_LABEL[r][lang]} />
              ))}
            </div>

            {feast.note && (
              <p
                className="selectable"
                style={{
                  margin: "16px 0 0",
                  fontSize: 14.5,
                  lineHeight: 1.85,
                  color: "var(--body)",
                }}
              >
                {feast.note}
              </p>
            )}

            {/* The way out to the whole story. Most of the calendar is names —
                a reader who wants to know who Perpetua was should not have to
                go and type it somewhere else. New tab, because leaving the app
                to read a life and coming back to a lost place in a prayer is
                not a trade anyone would choose. */}
            {feast.link && (
              <a
                href={feast.link}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  margin: "18px 0 0",
                  padding: "9px 15px",
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 500,
                  textDecoration: "none",
                  color: "var(--accent-ink)",
                  background: "rgb(var(--accent-rgb) / .1)",
                  border: "1px solid rgb(var(--accent-rgb) / .25)",
                }}
              >
                {s.read}
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                  style={{
                    width: 12,
                    height: 12,
                    flex: "none",
                    // The arrow points the way the reader's script runs.
                    transform: ar ? "scaleX(-1)" : undefined,
                  }}
                >
                  <path
                    d="M6 3.5 L10.5 8 L6 12.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Chip({ text, dot }: { text: string; dot?: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 11px",
        borderRadius: 999,
        fontSize: 11.5,
        color: "var(--soft)",
        background: "rgb(var(--veil-rgb) / .05)",
        border: "1px solid rgb(var(--veil-rgb) / .07)",
      }}
    >
      {dot && (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: dot,
            flex: "none",
          }}
        />
      )}
      {text}
    </span>
  );
}
