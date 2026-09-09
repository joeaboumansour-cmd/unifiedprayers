"use client";

import { type Lang, ui } from "@/lib/content";
import type { DevotionTrack } from "@/lib/supabase/types";
import { TRACKS, type Devotions } from "@/lib/useDevotions";

const EASE = "cubic-bezier(.22,1,.36,1)";

/**
 * One ring for the person praying alone, two joined for the couple. The same
 * circle-pair vocabulary the tab bar and the prayer rows are drawn in.
 */
export function TrackGlyph({ track, lit }: { track: DevotionTrack; lit: boolean }) {
  const ink = lit ? "var(--accent)" : "rgb(var(--accent-rgb) / .45)";
  return (
    <svg viewBox="0 0 34 22" style={{ width: 30, height: 20, flex: "none" }}>
      {track === "individual" ? (
        <>
          <circle cx="17" cy="11" r="7.5" fill="none" stroke={ink} strokeWidth="1.3" />
          <circle cx="17" cy="11" r="2.6" fill={ink} />
        </>
      ) : (
        <>
          <circle cx="12" cy="11" r="7.5" fill="none" stroke={ink} strokeWidth="1.3" />
          <circle cx="22" cy="11" r="7.5" fill="none" stroke={ink} strokeWidth="1.3" />
          <circle cx="17" cy="11" r="2.2" fill={ink} />
        </>
      )}
    </svg>
  );
}

/** The padlock on the couples card, before the reader is paired. */
function LockMark() {
  return (
    <svg viewBox="0 0 16 16" style={{ width: 13, height: 15, flex: "none" }}>
      <path
        d="M5 7V5a3 3 0 0 1 6 0v2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <rect
        x="3.2"
        y="7"
        width="9.6"
        height="7"
        rx="1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

/** The tick on a card already read today. */
function ReadMark() {
  return (
    <svg viewBox="0 0 16 16" style={{ width: 13, height: 13, flex: "none" }}>
      <path
        d="M3 8.4 L6.4 12 L13 4.6"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type DevotionCardsProps = {
  lang: Lang;
  devotions: Devotions;
  /**
   * Whether this account is half of a couple. The couples card is drawn locked
   * without it — and the database refuses that book without it too, so this is
   * how the card is drawn, not what decides whether it opens.
   */
  paired: boolean;
  onOpen: (track: DevotionTrack) => void;
  /** Tapping the locked card. Opens the pairing sheet rather than the page. */
  onLocked: () => void;
};

/**
 * The two sealed cards, one per book.
 *
 * A card never shows the title of a page that has not been opened — that is
 * the whole point of the surface, and giving away the heading on the home
 * screen would spend the reveal before the reader has touched anything. Once
 * the page has been read the card says so and stays tappable, because reading
 * it twice is a thing people do.
 *
 * A book with nothing for today is drawn flat and inert rather than hidden.
 * Two cards that are sometimes one card is a layout that moves under the
 * reader's thumb, and "today's has not been added" is worth saying.
 */
export default function DevotionCards({
  lang,
  devotions,
  paired,
  onOpen,
  onLocked,
}: DevotionCardsProps) {
  const t = ui(lang);
  const d = t.devotion;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {TRACKS.map((track, i) => {
        const page = devotions.byTrack[track];
        const read = devotions.isRead(track);
        const partway = devotions.isUnfinished(track);
        const label = d.tracks[i];

        // Before the first answer lands the cards are drawn in their empty
        // state but say nothing, so a card does not flash "not added yet" at
        // someone half a second before their devotion appears in it.
        const waiting = !devotions.ready;
        /* Locked rather than empty, and the difference matters: an unpaired
           reader gets nothing back from the database for this book, so `page`
           is null for exactly the same reason it is null on a day with no
           entry. Saying "not added yet" there would be a lie. */
        const locked = track === "couples" && !paired;
        const has = !locked && Boolean(page);
        // A locked card is not inert — it is the only place the pairing
        // mechanism is explained, so tapping it has to do something.
        const tappable = has || locked;

        return (
          <button
            key={track}
            type="button"
            className={tappable ? "tap" : undefined}
            disabled={!tappable}
            onClick={() => (locked ? onLocked() : has && onOpen(track))}
            style={{
              appearance: "none",
              textAlign: "start",
              position: "relative",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minHeight: 116,
              padding: "15px 14px",
              borderRadius: 20,
              cursor: tappable ? "pointer" : "default",
              background: has
                ? "linear-gradient(150deg,rgb(var(--accent-rgb) / .13),var(--resume-b))"
                : "rgb(var(--veil-rgb) / .028)",
              border: `1px solid ${
                has
                  ? "rgb(var(--accent-rgb) / .22)"
                  : locked
                    ? "rgb(var(--veil-rgb) / .1)"
                    : "rgb(var(--veil-rgb) / .05)"
              }`,
              transition: `background .4s ${EASE}, border-color .4s ${EASE}`,
            }}
          >
            {/* The glow behind an unopened card, breathing so the pair reads
                as waiting rather than as two more static tiles. A card already
                read goes quiet — it has nothing left to offer today. */}
            {has && !read && (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: -60,
                  insetInlineEnd: -40,
                  width: 150,
                  height: 150,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle,rgb(var(--accent-soft-rgb) / .3),transparent 70%)",
                  animation: "upHalo 5.5s ease-in-out infinite",
                  pointerEvents: "none",
                }}
              />
            )}

            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <TrackGlyph track={track} lit={has} />
              {read && <ReadMark />}
              {locked && (
                <span style={{ color: "var(--dim-2)", display: "flex" }}>
                  <LockMark />
                </span>
              )}
            </div>

            <div
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                gap: 5,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontSize: 14.5,
                  fontWeight: 500,
                  lineHeight: 1.35,
                  color: has ? "var(--ink)" : locked ? "var(--soft)" : "var(--dim-2)",
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  color: read || partway
                    ? "var(--accent-ink)"
                    : has
                      ? "var(--soft)"
                      : "var(--dim-3)",
                  // Reserves the line's height while the answer is in flight,
                  // so the pair does not resize under the thumb when it lands.
                  minHeight: "1.5em",
                }}
              >
                {locked
                  ? d.locked
                  : waiting
                    ? ""
                    : read
                      ? d.read
                      : partway
                        ? d.resume
                        : has
                          ? d.reveal
                          : d.empty}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
