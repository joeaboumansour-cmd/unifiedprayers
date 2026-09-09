"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drag a bottom sheet down to dismiss it.
 *
 * Every sheet in the app already draws the little grab handle at its top edge,
 * which on a phone is a promise: that bar means "pull me down". Four sheets
 * were making that promise and none were keeping it. This is the one
 * implementation they all use, so they cannot drift apart.
 *
 * Pointer events rather than touch events, so a mouse drag works on the
 * desktop layout too, and so there is one code path rather than two.
 *
 * Only downward movement counts. A sheet that can be pulled up as well is a
 * sheet that fights the reader scrolling its own content, and several of these
 * scroll.
 */

/** Past this far, letting go dismisses. Roughly a third of a short sheet. */
const DISTANCE = 110;

/** Or a flick: this fast, in px/ms, dismisses from anywhere. */
const VELOCITY = 0.5;

/** Ignored below this, so a tap that wobbles is still a tap. */
const SLOP = 4;

export type SheetDrag = {
  /** Spread onto the sheet element. */
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
  /** Current downward offset in pixels. Zero unless a drag is in progress. */
  offset: number;
  /** True while a finger is down and moving, so the caller drops its easing. */
  dragging: boolean;
};

export function useSheetDrag(
  open: boolean,
  onDismiss: () => void,
  /** Off for a sheet that must be acted on rather than waved away. */
  enabled = true,
): SheetDrag {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  // The gesture, kept in a ref: it changes every pointermove and none of it
  // needs to re-render anything except through `offset`.
  const g = useRef({ id: -1, y: 0, t: 0, lastY: 0, lastT: 0, active: false });

  // A sheet that closes some other way — a button, the scrim — must not come
  // back next time still holding the offset it was left at.
  useEffect(() => {
    if (!open) {
      setOffset(0);
      setDragging(false);
      g.current.active = false;
    }
  }, [open]);

  const down = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || !open) return;
      // A second finger during a drag would otherwise fight the first.
      if (g.current.active) return;

      /* Not from inside a scrolled region. Dragging down at the top of a list
         should scroll the list back up, not throw the sheet away — and the
         browser resolves that for a native scroller far better than a
         threshold here could. */
      const el = e.target as HTMLElement | null;
      if (el?.closest?.(".scroll-y")) return;
      // Nor from a control: pulling on a button is a mis-grab, not a gesture.
      if (el?.closest?.("button, a, input, textarea, select")) return;

      g.current = {
        id: e.pointerId,
        y: e.clientY,
        t: Date.now(),
        lastY: e.clientY,
        lastT: Date.now(),
        active: true,
      };
    },
    [enabled, open],
  );

  const move = useCallback(
    (e: React.PointerEvent) => {
      const s = g.current;
      if (!s.active || e.pointerId !== s.id) return;

      const dy = e.clientY - s.y;
      s.lastY = e.clientY;
      s.lastT = Date.now();

      if (dy <= SLOP) {
        // Back above where it started, or not yet moved: sit at rest rather
        // than letting the sheet be pulled up off the bottom of the screen.
        if (dragging) setDragging(false);
        setOffset(0);
        return;
      }

      if (!dragging) {
        setDragging(true);
        // From here the sheet owns the gesture, so the browser must stop
        // trying to scroll or rubber-band the page with the same finger.
        (e.currentTarget as HTMLElement).setPointerCapture?.(s.id);
      }
      setOffset(dy);
    },
    [dragging],
  );

  const up = useCallback(
    (e: React.PointerEvent) => {
      const s = g.current;
      if (!s.active || e.pointerId !== s.id) return;
      s.active = false;

      const dy = e.clientY - s.y;
      const dt = Math.max(1, s.lastT - s.t);
      const v = dy / dt;

      setDragging(false);

      if (dy > DISTANCE || (dy > SLOP * 4 && v > VELOCITY)) {
        // Let the caller's own close transition carry it the rest of the way
        // from where the finger left it.
        onDismiss();
        return;
      }
      setOffset(0);
    },
    [onDismiss],
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
  };
}

/**
 * The sheet's transform and transition, given a drag.
 *
 * Kept here rather than repeated in four components, because the rule is
 * subtle: while a finger is down the sheet must follow it with no easing at
 * all, and the moment it is let go the easing has to come back so it can
 * spring home or slide out.
 */
export function sheetMotion(
  open: boolean,
  drag: SheetDrag,
  /** How far off-screen the closed state sits, e.g. "105%". */
  closed: string,
  ease: string,
): { transform: string; transition: string } {
  return {
    transform: open
      ? `translateY(${drag.offset}px)`
      : `translateY(${closed})`,
    transition: drag.dragging ? "none" : `transform .48s ${ease}`,
  };
}
