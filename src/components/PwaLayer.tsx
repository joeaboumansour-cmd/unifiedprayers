"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

const EASE = "cubic-bezier(.22,1,.36,1)";

/* The install sheet is deliberately English-only: it is device chrome about
   installing the app, not part of the prayer content. */
const C = {
  title: "Add the rosary to your home screen",
  blurb: "Pray offline, full screen, from an icon on your device.",
  install: "Install app",
  later: "Later",
  got: "Got it",
  updated: "A new version is ready",
  update: "Update",
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
  const [updateReady, setUpdateReady] = useState<ServiceWorker | null>(null);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const reloading = useRef(false);

  /* ---------------- service worker + update prompt ---------------- */
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onControllerChange = () => {
      if (reloading.current) return;
      reloading.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) {
          setUpdateReady(reg.waiting);
        }
        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener("statechange", () => {
            // Installing while another worker is in control is an update,
            // not a first install — only then is a reload worth offering.
            if (next.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateReady(next);
            }
          });
        });
      })
      .catch(() => {});

    return () =>
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
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
            border: "1px solid rgba(255,255,255,.1)",
            padding: "14px 20px 22px",
            boxShadow: "0 -20px 60px rgba(0,0,0,.5)",
            transition: `transform .48s ${EASE}`,
            transform: open ? "translateY(0)" : "translateY(110%)",
          }}
        >
          <div
            style={{
              width: 38,
              height: 4,
              borderRadius: 999,
              background: "rgba(255,255,255,.22)",
              margin: "0 auto 18px",
            }}
          />

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
                border: "1px solid rgba(255,255,255,.08)",
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
                  background: "rgba(255,255,255,.04)",
                  border: "1px solid rgba(255,255,255,.07)",
                  marginBottom: 12,
                }}
              >
                Tap the Share button in Safari&apos;s bottom bar, then choose{" "}
                <strong style={{ color: "var(--accent)" }}>Add to Home Screen</strong>.
              </div>
              <button
                type="button"
                onClick={dismiss}
                style={{
                  width: "100%",
                  height: 48,
                  borderRadius: 16,
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(255,255,255,.09)",
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
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(255,255,255,.09)",
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

      {/* update toast */}
      {updateReady && (
        <div
          dir="ltr"
          style={{
            position: "fixed",
            // Physical left, so centring holds in both text directions.
            left: "50%",
            transform: "translateX(-50%)",
            bottom: "71px",
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            gap: 12,
            width: "max-content",
            maxWidth: "92vw",
            padding: "10px 12px 10px 16px",
            borderRadius: 999,
            background: "var(--surface)",
            border: "1px solid rgba(255,255,255,.12)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            boxShadow: "0 12px 32px rgba(0,0,0,.5)",
            fontSize: 13,
          }}
        >
          <span>{C.updated}</span>
          <button
            type="button"
            onClick={() => {
              updateReady.postMessage("SKIP_WAITING");
              setUpdateReady(null);
            }}
            style={{
              flex: "none",
              padding: "7px 14px",
              borderRadius: 999,
              background: "var(--accent)",
              color: "var(--on-accent)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {C.update}
          </button>
        </div>
      )}
    </>
  );
}
