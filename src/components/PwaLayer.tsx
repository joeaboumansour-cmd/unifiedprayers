"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { isAppBusy, subscribeAppBusy } from "@/lib/appBusy";
import { onForeground } from "@/lib/live";
import { sheetMotion, useSheetDrag } from "@/lib/useSheetDrag";

/** Chrome's install event, which the DOM lib does not type. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "up.installDismissedAt";
/** How long a "later" is respected before the sheet may appear again. */
const DISMISS_DAYS = 7;
/** Let the app paint before anything is laid over it. */
const SHOW_DELAY_MS = 800;
/** If Chrome has not offered an install by now, it is not going to. */
const PROMPT_WAIT_MS = 2500;
/**
 * How often an app left open asks whether a new build has shipped. Every
 * resume asks too, so this only covers the phone sitting unlocked on a table;
 * between the two, a deploy reaches a device about a minute after it lands.
 */
const UPDATE_POLL_MS = 60_000;

const EASE = "cubic-bezier(.22,1,.36,1)";

/* The install sheet is deliberately English-only: it is device chrome about
   installing the app, not part of the prayer content. */
const C = {
  title: "Add the rosary to your home screen",
  blurb: "Pray offline, full screen, from an icon on your device.",
  install: "Install app",
  later: "Later",
  got: "Got it",
};

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export default function PwaLayer() {
  const [sheet, setSheet] = useState<null | "prompt" | "ios">(null);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const reloading = useRef(false);

  /* ---------------- service worker + automatic update ----------------

     A new build applies itself. There is no "a new version is ready" toast to
     tap, because a toast is a version that reaches only the readers who
     noticed it — and the whole point of a message an admin publishes is that
     it reaches everyone, on the day they publish it.

     The one thing that is allowed to delay it is a prayer in progress: the
     update takes effect through a page reload, and a reload mid-decade drops
     the reader back to the home screen. So it waits for the closing moment,
     which is never long. */
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Taking control with nothing to replace is the first install, not an
    // update; reloading for it would restart the app on somebody's first
    // ever visit. Only a worker succeeding another one warrants a reload.
    const hadController = Boolean(navigator.serviceWorker.controller);

    const onControllerChange = () => {
      if (!hadController || reloading.current) return;
      reloading.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    // The downloaded-and-waiting worker, if there is one. Not state: nothing
    // renders from it, and re-rendering the tree for it would buy nothing.
    let pending: ServiceWorker | null = null;
    let stopPolling: (() => void) | null = null;

    const apply = () => {
      if (!pending || isAppBusy()) return;
      const worker = pending;
      pending = null;
      // The worker calls skipWaiting, takes control, and the controllerchange
      // above reloads the page onto the new build.
      worker.postMessage("SKIP_WAITING");
    };

    navigator.serviceWorker
      .register("/sw.js", {
        // Without this the browser may answer the update check out of its own
        // HTTP cache for up to a day — the difference between a deploy landing
        // in a minute and landing tomorrow.
        updateViaCache: "none",
      })
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) {
          pending = reg.waiting;
          apply();
        }

        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener("statechange", () => {
            if (next.state === "installed" && navigator.serviceWorker.controller) {
              pending = next;
              apply();
            }
          });
        });

        // Registration checks once by itself; this is every resume afterwards,
        // plus a slow beat while the app is on screen.
        stopPolling = onForeground(() => {
          reg.update().catch(() => {});
        }, UPDATE_POLL_MS);
      })
      .catch(() => {});

    // A prayer ending is the moment a held-back build becomes safe to apply.
    const stopWatchingBusy = subscribeAppBusy((busy) => {
      if (!busy) apply();
    });

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      stopWatchingBusy();
      stopPolling?.();
    };
  }, []);

  /* ---------------- install sheet ---------------- */
  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    const timers: number[] = [];

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BeforeInstallPromptEvent;
      timers.push(window.setTimeout(() => setSheet("prompt"), SHOW_DELAY_MS));
    };
    const onInstalled = () => {
      setSheet(null);
      deferred.current = null;
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {
        /* private mode */
      }
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // Safari never fires beforeinstallprompt, so iOS gets the manual route.
    if (isIOS()) {
      timers.push(window.setTimeout(() => setSheet("ios"), SHOW_DELAY_MS));
    } else {
      // Some Chromium builds hold the event back; stop waiting after a beat.
      timers.push(
        window.setTimeout(() => {
          if (!deferred.current) setSheet(null);
        }, PROMPT_WAIT_MS),
      );
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      timers.forEach(window.clearTimeout);
    };
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* private mode — the sheet simply reappears next visit */
    }
    setSheet(null);
  }, []);

  const install = useCallback(async () => {
    const e = deferred.current;
    if (!e) return dismiss();
    setSheet(null);
    e.prompt();
    try {
      await e.userChoice;
    } catch {
      /* the browser closed the prompt for us */
    }
    deferred.current = null;
  }, [dismiss]);

  const open = sheet !== null;
  const drag = useSheetDrag(open, dismiss);


  return (
    <>
      {/* install sheet */}
      <div
        aria-hidden={!open}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1300,
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
        onClick={dismiss}
      >
        <div
          role="dialog"
          dir="ltr"
          aria-modal={open}
          aria-labelledby="install-title"
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
            ...sheetMotion(open, drag, "110%", EASE),
          }}
        >
          {/* Same grab area as the prayer sheets — see the note in
              MysterySheet. Four sheets in this app draw this bar; all four
              answer to it. */}
          <div
            {...drag.handlers}
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "4px 0 14px",
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

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 13,
              marginBottom: 14,
            }}
          >
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
              <div
                id="install-title"
                style={{ fontSize: 17, fontWeight: 600, marginBottom: 3 }}
              >
                {C.title}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.5 }}>
                {C.blurb}
              </div>
            </div>
          </div>

          {sheet === "ios" ? (
            <>
              <div
                style={{
                  fontSize: 13.5,
                  lineHeight: 1.9,
                  color: "var(--body)",
                  padding: "12px 14px",
                  borderRadius: 14,
                  background: "rgb(var(--veil-rgb) / .04)",
                  border: "1px solid rgb(var(--veil-rgb) / .07)",
                  marginBottom: 12,
                }}
              >
                Tap the Share button in Safari&apos;s bottom bar, then choose{" "}
                <strong style={{ color: "var(--accent-ink)" }}>Add to Home Screen</strong>.
              </div>
              <button
                type="button"
                onClick={dismiss}
                style={{
                  width: "100%",
                  height: 48,
                  borderRadius: 16,
                  background: "rgb(var(--veil-rgb) / .06)",
                  border: "1px solid rgb(var(--veil-rgb) / .09)",
                  color: "var(--soft-2)",
                  fontSize: 14.5,
                  fontWeight: 500,
                }}
              >
                {C.got}
              </button>
            </>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={install}
                style={{
                  flex: 1,
                  height: 50,
                  borderRadius: 16,
                  background: "linear-gradient(135deg,var(--accent),var(--accent-deep))",
                  color: "var(--on-accent)",
                  fontSize: 15,
                  fontWeight: 600,
                }}
              >
                {C.install}
              </button>
              <button
                type="button"
                onClick={dismiss}
                style={{
                  height: 50,
                  padding: "0 20px",
                  borderRadius: 16,
                  background: "rgb(var(--veil-rgb) / .06)",
                  border: "1px solid rgb(var(--veil-rgb) / .09)",
                  color: "var(--soft-2)",
                  fontSize: 14.5,
                }}
              >
                {C.later}
              </button>
            </div>
          )}
        </div>
      </div>

    </>
  );
}
