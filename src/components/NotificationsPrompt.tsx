"use client";

import { useEffect, useState } from "react";

import type { Push } from "@/lib/usePush";

/**
 * Asks, on launch, for permission to send notifications.
 *
 * It appears every time the app opens while notifications are off, and "Later"
 * only quiets it for the session — that is what was asked for, and it is a
 * deliberate difference from the install sheet next door, which respects a
 * "later" for seven days.
 *
 * The two-step shape is what keeps that safe rather than merely loud. This
 * sheet is the app's own; the browser's permission prompt only fires when
 * someone taps Turn on. That matters because Chrome permanently blocks a site
 * whose *native* prompt is dismissed repeatedly — so a person who taps Later
 * every single launch loses nothing, and can still say yes a year from now.
 * Calling requestPermission() on launch instead would spend that one chance
 * immediately, on someone who had not asked for it.
 *
 * English-only, like the install sheet it sits next to and deliberately unlike
 * the rest of the app. Both are device chrome — a question about how this phone
 * is set up — rather than anything anyone prays, and the Settings card that
 * carries the same feature stays bilingual because that one is app UI.
 *
 * It is shown only in the one state where it can lead anywhere:
 *
 *   off             the whole point — supported, permitted to ask, not on
 *   blocked         only the browser's settings can undo this, so asking again
 *                   is asking someone to do something the app cannot help with
 *   needs-install   iOS before the Home Screen. The install sheet already
 *                   covers this, and two sheets on one launch is a pile-up
 *   unsupported /
 *   unconfigured    nothing to turn on
 *   on              already done
 */

const EASE = "cubic-bezier(.22,1,.36,1)";

/** Long enough that the app is painted and read before anything covers it. */
const DELAY_MS = 1600;

const C = {
  title: "Turn on notifications",
  blurb: "A daily reminder at an hour you choose, and the occasional message from the app.",
  enable: "Turn on",
  later: "Later",
  working: "One moment…",
} as const;

export default function NotificationsPrompt({
  push,
  /** Held back while a prayer, the closing moment or another sheet is up. */
  suppressed,
}: {
  push: Push;
  suppressed: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  const open =
    ready && !dismissed && !suppressed && push.state === "off" && !push.error;

  // Kept mounted so the sheet can slide away rather than vanish, and so a
  // failure message has somewhere to appear on the way out.
  return (
    <div
      aria-hidden={!open}
      onClick={() => setDismissed(true)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        background: "var(--scrim)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        transition: "opacity .35s ease",
        opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
      }}
    >
      <div
        role="dialog"
        aria-modal={open}
        aria-labelledby="notify-title"
        dir="ltr"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 460,
          margin: "0 10px max(10px, var(--safe-b))",
          borderRadius: "28px 28px 22px 22px",
          background: "var(--surface)",
          border: "1px solid rgb(var(--veil-rgb) / .1)",
          padding: "14px 20px 22px",
          boxShadow: "0 -20px 60px rgb(var(--shadow-rgb) / var(--shadow-a))",
          transition: `transform .48s ${EASE}`,
          transform: open ? "translateY(0)" : "translateY(110%)",
        }}
      >
        <div
          style={{
            width: 38,
            height: 4,
            borderRadius: 999,
            background: "rgb(var(--veil-rgb) / .22)",
            margin: "0 auto 18px",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt=""
            width={52}
            height={52}
            style={{
              borderRadius: 13,
              flex: "none",
              border: "1px solid rgb(var(--veil-rgb) / .08)",
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div id="notify-title" style={{ fontSize: 17, fontWeight: 600, marginBottom: 3 }}>
              {C.title}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.6 }}>
              {C.blurb}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={() => {
              // Not awaited, and the sheet is not closed here: the browser's
              // own prompt opens on top of it, and closing underneath that
              // makes the app look like it did something else.
              push.enable().then((ok) => {
                if (ok) setDismissed(true);
              });
            }}
            disabled={push.busy}
            style={{
              flex: 1,
              height: 48,
              borderRadius: 16,
              background: "rgb(var(--accent-rgb) / .95)",
              border: "none",
              color: "var(--on-accent)",
              fontSize: 15,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: push.busy ? "default" : "pointer",
            }}
          >
            {push.busy ? C.working : C.enable}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            style={{
              flex: "none",
              minWidth: 108,
              height: 48,
              borderRadius: 16,
              background: "rgb(var(--veil-rgb) / .06)",
              border: "1px solid rgb(var(--veil-rgb) / .09)",
              color: "var(--soft-2)",
              fontSize: 14.5,
              fontWeight: 500,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            {C.later}
          </button>
        </div>
      </div>
    </div>
  );
}
