"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Swipe sideways to change tab.
 *
 * The tab bar was the only way across, and on a phone four pages laid out in a
 * row are a thing you expect to be able to push. So the pages sit in a track
 * that follows the finger and snaps to the nearest tab, and the bar becomes the
 * other way to do it rather than the only one.
 *
 * Pointer events, but touch and pen only. A mouse has no swipe to make — the
 * desktop layout shows the bar at all times — and a mouse drag across a page of
 * prayer text is somebody selecting it, which this would steal.
 *
 * The gesture is axis-locked on its first real movement and never re-decides.
 * Everything here scrolls vertically, and a carousel that keeps asking which
 * way the finger is going turns every diagonal scroll into a half-turned page.
 * The panes carry `touch-action: pan-y`, so the browser makes the same call for
 * its own scrolling and the two locks agree.
 */

/** Past this much of a page's width, letting go lands on the next tab. */
const DISTANCE = 0.22;

/** Or a flick: this fast, in px/ms, carries from anywhere past the slop. */
const VELOCITY = 0.35;

/** Below this the gesture has not said what it is yet. */
const SLOP = 8;

/** How much of a pull past the first or last tab actually shows. */
const RESIST = 0.32;

export type TabSwipe = {
  /** Spread onto the element holding the pages. */
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
  /** Pixels the track is held at. Negative is toward the next tab. */
  offset: number;
  /** True while a finger is down and moving, so the caller drops its easing. */
  dragging: boolean;
  /**
   * Where the pages actually are, as a fractional tab index: 1.4 is Today,
   * most of the way to Calendar. The tab bar reads this so its chip travels
   * with the finger instead of jumping when the page lands.
   */
  at: number;
};

export function useTabSwipe(
  tab: number,
  /** How many tabs there are. The admin one comes and goes. */
  count: number,
  onSelect: (i: number) => void,
  /** Off while the player or a sheet owns the screen. */
  enabled = true,
): TabSwipe {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  // The gesture, kept in a ref: it changes every pointermove and none of it
  // needs to re-render anything except through `offset`.
  const g = useRef({
    id: -1,
    x: 0,
    y: 0,
    t: 0,
    /** The width of one page, measured when the finger lands. */
    w: 1,
    lastT: 0,
    axis: "" as "" | "x" | "y",
    active: false,
  });

  /* A tab changed some other way — a tap on the bar, the morning notification
     opening Today — must not leave the track sitting where a drag left it.
     The drag itself zeroes the offset in the same commit that moves the tab,
     so this is the net under the other ways in, not the normal path. */
  useEffect(() => {
    setOffset(0);
    setDragging(false);
    g.current.active = false;
  }, [tab]);

  const down = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;
      // A second finger during a drag would otherwise fight the first.
      if (g.current.active) return;
      if (e.pointerType === "mouse") return;

      // Not out of something that scrolls sideways on its own — the admin
      // table does, and inside it a sideways drag is the reader reading it.
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("[data-scroll-x]")) return;

      const now = Date.now();
      g.current = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        t: now,
        w: (e.currentTarget as HTMLElement).clientWidth || 1,
        lastT: now,
        axis: "",
        active: true,
      };
    },
    [enabled],
  );

  const move = useCallback(
    (e: React.PointerEvent) => {
      const s = g.current;
      if (!s.active || e.pointerId !== s.id) return;

      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      s.lastT = Date.now();

      if (s.axis === "") {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        s.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (s.axis === "x") {
          setDragging(true);
          try {
            // From here the pages own the gesture, so it keeps arriving here
            // even once the finger has left the element it started on.
            (e.currentTarget as HTMLElement).setPointerCapture?.(s.id);
          } catch {
            /* The pointer was already gone. The drag still works; it just
               stops early if the finger leaves the element. */
          }
        }
      }
      if (s.axis !== "x") return;

      // Past the first tab and past the last there is nothing to come next, so
      // the track gives a little and no more: enough to say the edge is real.
      const end = (tab === 0 && dx > 0) || (tab === count - 1 && dx < 0);
      setOffset(end ? dx * RESIST : dx);
    },
    [tab, count],
  );

  const up = useCallback(
    (e: React.PointerEvent) => {
      const s = g.current;
      if (!s.active || e.pointerId !== s.id) return;
      s.active = false;

      const dx = e.clientX - s.x;
      const v = Math.abs(dx) / Math.max(1, s.lastT - s.t);

      setDragging(false);
      /* Zeroed here rather than left for the effect above, so that the tab
         change and the reset land in one commit: the track's target becomes
         the next page and the easing carries it the rest of the way from
         where the finger stopped, with no frame in between. */
      setOffset(0);

      if (s.axis !== "x") return;
      const far = Math.abs(dx) > s.w * DISTANCE || (Math.abs(dx) > SLOP * 4 && v > VELOCITY);
      if (!far) return;

      const next = dx < 0 ? tab + 1 : tab - 1;
      if (next >= 0 && next < count) onSelect(next);
    },
    [tab, count, onSelect],
  );

  const cancel = useCallback(() => {
    g.current.active = false;
    setDragging(false);
    setOffset(0);
  }, []);

  return {
    handlers: {
      onPointerDown: down,
      onPointerMove: move,
      onPointerUp: up,
      onPointerCancel: cancel,
    },
    offset,
    dragging,
    // Dragging left is a negative offset and a move toward a higher index.
    at: tab - offset / (g.current.w || 1),
  };
}
