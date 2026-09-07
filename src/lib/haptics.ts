"use client";

/**
 * Taps you can feel, on both kinds of phone.
 *
 * Android and desktop Chrome have `navigator.vibrate`, which takes a pattern in
 * milliseconds. Safari has never shipped it — on an iPhone the property is
 * simply absent, which is why every `navigator.vibrate` call in this app has
 * always done nothing there.
 *
 * iOS does have one web-reachable haptic: toggling a `<input type="checkbox"
 * switch>` plays the system tick, the same one a Settings toggle gives. It is
 * the only one available to a web page, so a hidden switch is kept in the
 * document and flipped when a tap should be felt. The tick has no length and no
 * strength, so a pattern becomes a short run of ticks instead.
 *
 * Both paths need a user gesture in hand: called from a timer rather than a tap
 * handler, both are ignored by the browser.
 */

/** Safari exposes `switch` on the prototype from 17.4, which is the version that plays the tick. */
function iosSwitchSupported(): boolean {
  return (
    typeof HTMLInputElement !== "undefined" &&
    "switch" in HTMLInputElement.prototype
  );
}

function vibrateSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/** Whether this device can produce any haptic at all. */
export function hapticsSupported(): boolean {
  if (typeof window === "undefined") return false;
  return vibrateSupported() || iosSwitchSupported();
}

let toggle: HTMLInputElement | null = null;

/**
 * The hidden switch. It has to be laid out and hit-testable for the tick to
 * play, so it is a real 1px control parked off-screen rather than
 * `display: none`, and it is kept out of the tab order and the accessibility
 * tree because there is nothing here for a person to operate.
 */
function iosToggle(): HTMLInputElement | null {
  if (!iosSwitchSupported()) return null;
  if (toggle?.isConnected) return toggle;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");
  Object.assign(input.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
    zIndex: "-1",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(input);
  toggle = input;
  return input;
}

/** One system tick on iOS. */
function tick(): void {
  const input = iosToggle();
  if (!input) return;
  try {
    input.checked = !input.checked;
    // The tick follows the state change the switch renders, so it needs the
    // event a real toggle would have fired.
    input.dispatchEvent(new Event("change", { bubbles: true }));
  } catch {
    /* the element was torn out from under us */
  }
}

/**
 * Play a haptic. `ms` is a vibrate pattern: a single duration, or the
 * on/off/on/off list `navigator.vibrate` takes. On iOS every "on" segment
 * becomes one tick, scheduled at the point in the pattern where it falls, so a
 * flourish still reads as a flourish.
 *
 * Call this from a user gesture. Both engines drop haptics that arrive without
 * one.
 */
export function haptic(ms: number | number[] = 8): void {
  if (typeof window === "undefined") return;

  if (vibrateSupported()) {
    try {
      navigator.vibrate(ms);
    } catch {
      /* blocked by the browser, or the device has no motor */
    }
    return;
  }

  if (!iosSwitchSupported()) return;

  if (typeof ms === "number") {
    tick();
    return;
  }

  // Pattern positions: entries alternate vibrate, pause, vibrate, pause. Four
  // ticks is as much as reads as one gesture rather than a rattle.
  let at = 0;
  ms.slice(0, 7).forEach((segment, i) => {
    if (i % 2 === 0) {
      if (at === 0) tick();
      else window.setTimeout(tick, at);
    }
    at += segment;
  });
}
