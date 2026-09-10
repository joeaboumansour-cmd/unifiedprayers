"use client";

import { useEffect, useRef, useState } from "react";

import type { Lang } from "@/lib/content";
import type { Rite } from "@/lib/liturgy";
import type { Reading } from "@/lib/supabase/types";
import type { ReadingProgress } from "@/lib/useReadingProgress";

const T = {
  label: { ar: "قراءات اليوم", en: "Today's readings" },
  none: {
    ar: "لم تصل قراءات هذا اليوم بعد.",
    en: "The readings for this day have not arrived yet.",
  },
  done: { ar: "قرأتَ اليوم كلّه", en: "You read the whole day" },
  left: {
    ar: (n: number) => (n === 1 ? "بقيت قراءة واحدة" : `بقيت ${n} قراءات`),
    en: (n: number) => (n === 1 ? "one reading left" : `${n} readings left`),
  },
  streak: {
    ar: (n: number) => (n === 1 ? "يوم واحد متتالٍ" : `${n} أيام متتالية`),
    en: (n: number) => (n === 1 ? "1 day in a row" : `${n} days in a row`),
  },
  source: { ar: "المصدر", en: "Source" },
} as const;

/** The tick that draws itself once a reading has been opened. */
function Tick({ fresh }: { fresh: boolean }) {
  return (
    <svg viewBox="0 0 22 22" style={{ width: 17, height: 17, flex: "none" }} aria-hidden="true">
      <circle
        cx="11"
        cy="11"
        r="9"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.3"
        opacity={0.45}
        style={
          fresh
            ? {
                strokeDasharray: 57,
                strokeDashoffset: 57,
                animation: "rdDraw .45s var(--ease) forwards",
              }
            : undefined
        }
      />
      <path
        d="M6.5 11.4 L9.6 14.4 L15.4 7.9"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={
          fresh
            ? {
                strokeDasharray: 16,
                strokeDashoffset: 16,
                animation: "rdDraw .35s var(--ease) .3s forwards",
              }
            : undefined
        }
      />
    </svg>
  );
}

/**
 * One reading: a line that opens into a passage.
 *
 * The height is measured and animated rather than left to `auto`, which cannot
 * be transitioned, and rather than a large `max-height`, which makes a short
 * epistle snap open and a long gospel crawl.
 */
function ReadingRow({
  reading,
  read,
  lang,
  onOpen,
}: {
  reading: Reading;
  read: boolean;
  lang: Lang;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Only the tick on a reading opened *this* tap draws itself; the ones
  // already done when the screen loaded are simply there.
  const [fresh, setFresh] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>(0);

  useEffect(() => {
    if (open && body.current) setHeight(body.current.scrollHeight);
  }, [open, reading.text]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !read) {
      setFresh(true);
      onOpen();
    }
  };

  return (
    <div
      style={{
        borderRadius: 16,
        background: read ? "rgb(var(--accent-rgb) / .055)" : "rgb(var(--veil-rgb) / .04)",
        border: `1px solid ${read ? "rgb(var(--accent-rgb) / .18)" : "rgb(var(--veil-rgb) / .07)"}`,
        overflow: "hidden",
        transition: "background .5s var(--ease), border-color .5s var(--ease)",
      }}
    >
      <button
        type="button"
        className="tap"
        onClick={toggle}
        disabled={!reading.text}
        style={{
          appearance: "none",
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "13px 14px",
          background: "none",
          border: "none",
          textAlign: "start",
          fontFamily: "inherit",
          color: "var(--body)",
          cursor: reading.text ? "pointer" : "default",
        }}
      >
        {read ? (
          <Tick fresh={fresh} />
        ) : (
          <span
            aria-hidden="true"
            style={{
              width: 17,
              height: 17,
              flex: "none",
              borderRadius: "50%",
              border: "1.4px solid rgb(var(--veil-rgb) / .22)",
            }}
          />
        )}
        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.5 }}>
          {/* The label the rite itself gives this reading, not one of ours:
              what sits in a slot differs from church to church. */}
          {reading.label ?? reading.ref}
        </span>
        {reading.text && (
          <span
            aria-hidden="true"
            style={{
              flex: "none",
              fontSize: 15,
              color: "var(--dim-3)",
              transform: open ? "rotate(45deg)" : "none",
              transition: "transform .35s var(--ease)",
            }}
          >
            +
          </span>
        )}
      </button>

      {open && reading.text && (
        <div
          className="rd-unroll"
          style={{
            overflow: "hidden",
            // The measured height, handed to the keyframes.
            ["--rd-h" as string]: `${height}px`,
            animation: "rdUnroll .5s var(--ease) forwards",
          }}
        >
          <div ref={body}>
            <p
              className="selectable rd-words"
              style={{
                margin: 0,
                padding: "2px 14px 14px",
                fontSize: 14.5,
                lineHeight: 1.95,
                color: "var(--body)",
                whiteSpace: "pre-line",
                animation: "rdWords .45s var(--ease) .12s both",
              }}
            >
              {reading.text}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Today's readings, as something to get to the end of.
 *
 * The rest of this screen is an invitation; this is the one part with a state
 * that can be finished, so it is the one part that keeps score. The scoring is
 * deliberately small — a tick per reading, one pulse when the day closes, and a
 * count of consecutive days — because the thing being counted is somebody
 * reading scripture, and a progress bar that shouts would be the wrong shape
 * of encouragement entirely.
 */
export default function ReadingCards({
  readings,
  progress,
  lang,
  translation,
  source,
}: {
  readings: Reading[];
  progress: ReadingProgress;
  lang: Lang;
  translation: string | null;
  source: string | null;
  /** The rite is already reflected in `readings`; kept out of here on purpose. */
  rite?: Rite;
}) {
  if (!readings.length) return null;

  const remaining = readings.length - progress.count;

  return (
    <div
      className={progress.justCompleted ? "rd-complete" : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        borderRadius: 20,
        animation: progress.justCompleted ? "rdComplete 1.1s var(--ease)" : undefined,
      }}
    >
      {readings.map((r) => (
        <ReadingRow
          key={r.kind}
          reading={r}
          read={progress.isRead(r.kind)}
          lang={lang}
          onOpen={() => progress.open(r.kind)}
        />
      ))}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          marginTop: 2,
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: progress.complete ? "var(--accent-ink)" : "var(--dim-3)",
            transition: "color .5s var(--ease)",
          }}
        >
          {progress.complete ? T.done[lang] : T.left[lang](remaining)}
        </span>

        {progress.complete && progress.streak > 0 && (
          <span
            className="rd-streak"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 11px",
              borderRadius: 999,
              fontSize: 11.5,
              color: "var(--accent-ink)",
              background: "rgb(var(--accent-rgb) / .1)",
              border: "1px solid rgb(var(--accent-rgb) / .22)",
              animation: "rdStreak .5s var(--ease) both",
            }}
          >
            {/* A small flame, drawn rather than an emoji, so it takes the
                palette's accent like everything else on this screen. */}
            <svg viewBox="0 0 16 16" style={{ width: 11, height: 11 }} aria-hidden="true">
              <path
                d="M8 1.5c2.2 2.4 4.2 4 4.2 7A4.2 4.2 0 0 1 8 14.5 4.2 4.2 0 0 1 3.8 8.5c0-1.5.7-2.6 1.6-3.6 0 1 .5 1.7 1.2 1.9.3-2 .6-3.5 1.4-5.3Z"
                fill="currentColor"
                opacity="0.9"
              />
            </svg>
            {T.streak[lang](progress.streak)}
          </span>
        )}
      </div>

      {(translation || source) && (
        <div style={{ fontSize: 10.5, color: "var(--dim-4)", lineHeight: 1.6 }}>
          {translation ? `${translation} · ` : ""}
          {source ? `${T.source[lang]}: ${source}` : ""}
        </div>
      )}
    </div>
  );
}

export const readingsLabel = (lang: Lang) => T.label[lang];
export const readingsEmpty = (lang: Lang) => T.none[lang];
