"use client";

import type { CSSProperties, ReactNode } from "react";

import type { PrayerId } from "@/lib/content";

/**
 * The dove and Mary art, as a small round icon for a list row.
 *
 * The same two images the player puts at the centre of the bead arc
 * (public/dove.webp, public/mary.webp), so a row and the prayer it opens are
 * visibly the same thing. Only the framing differs: the player's copy is
 * 200px and more, floating on a screen blend with no edge, because it is the
 * thing being looked at and it has the whole screen to sit in.
 *
 * Here the art is cropped into the disc instead — no blend mode, no mask.
 * Blending them at this size put their own rectangular grounds through the
 * circle as a faint square, because a screen blend leaves a dark background
 * dark rather than removing it. A crop has no such edge to show: outside the
 * circle there is nothing.
 *
 * Cropping is what makes FRAMING below necessary. Neither source is composed
 * for a 44px circle — one is a square with the subject spanning it corner to
 * corner, the other a tall portrait whose subject sits above the middle — so
 * each needs its own centre and its own magnification.
 */

const FRAMING: Record<PrayerId, { position: string; scale: number }> = {
  /* Square source, so the crop keeps all of it and this only pushes the
     vignetted corners out past the circle. Any more and the wingtips go: they
     very nearly touch the edges of the dove's own canvas. */
  spirit: { position: "50% 50%", scale: 1.14 },
  /* Tall portrait. The two haloed heads sit together a little above the middle
     and everything below them is robe, so the crop is pulled up onto the faces
     and pushed in until they fill the disc. */
  mary: { position: "50% 42%", scale: 1.5 },
};

export type RosaryIconProps = {
  prayer: PrayerId;
  /** Rendered diameter in CSS pixels. */
  size?: number;
};

export default function RosaryIcon({ prayer, size = 44 }: RosaryIconProps) {
  const frame = FRAMING[prayer];

  const art: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    // Fills the disc, so no part of the source's own rectangle can show.
    objectFit: "cover",
    objectPosition: frame.position,
    // Applied after the fit and about the centre — which objectPosition has
    // already moved the subject to. So this magnifies the subject rather than
    // whatever corner the crop happened to start from.
    transform: `scale(${frame.scale})`,
    transition: "opacity .3s ease",
  };

  return (
    <IconPlate size={size}>
      {/* Both images are mounted and cross-faded by opacity rather than one
          being swapped in, matching the player — and it means neither has to be
          fetched at the moment a row is first painted. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/dove.webp"
        alt=""
        style={{ ...art, opacity: prayer === "mary" ? 0 : 1 }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/mary.webp"
        alt=""
        style={{ ...art, opacity: prayer === "mary" ? 1 : 0 }}
      />
      {/* The rim, drawn over the art rather than as a border on the disc: a
          border would sit outside the crop and read as a ring around the icon
          instead of the edge of it. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: "1px solid rgb(var(--accent-rgb) / .45)",
          boxShadow: "inset 0 0 10px rgb(var(--shadow-rgb) / .5)",
          pointerEvents: "none",
        }}
      />
    </IconPlate>
  );
}

/**
 * The disc itself, without anything on it.
 *
 * Exported because the resume list puts prayers and devotions in the same
 * shape of card, and two entries in one list must not be framed two different
 * ways. The devotion glyph goes on this same plate.
 */
export function IconPlate({
  size = 44,
  children,
}: {
  size?: number;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "relative",
        flex: "none",
        width: size,
        height: size,
        borderRadius: "50%",
        // What actually makes the art round, and what keeps its rectangle from
        // ever being visible.
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Shows where nothing covers it: behind the devotion glyph, and under
        // the art for the moment before it has loaded.
        background:
          "radial-gradient(circle at 35% 28%, #24325a 0%, #0c1226 78%)",
        boxShadow: "0 0 0 1px rgb(var(--accent-rgb) / .3)",
      }}
    >
      {children}
    </div>
  );
}
