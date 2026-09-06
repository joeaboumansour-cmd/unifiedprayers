"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getSupabase } from "@/lib/supabase/client";

/**
 * Web Push, from the device's side.
 *
 * What makes this awkward is not the API, it is iOS. Safari has supported Web
 * Push since 16.4, but only for a PWA the person has added to their Home Screen
 * — in the browser itself `PushManager` is simply absent, and there is no way
 * to ask for permission or to explain why it failed. So this hook reports a
 * distinct state for that case (`needs-install`) and the UI shows instructions
 * rather than a button that cannot work.
 *
 * Android has no such rule: Chrome subscribes from the browser tab as happily
 * as from an installed app, and the same code path serves both.
 */

export type PushState =
  /** No service worker or no PushManager — an old browser, or a plain HTTP origin. */
  | "unsupported"
  /** iOS Safari: real support, but only once the app is on the Home Screen. */
  | "needs-install"
  /** The server has no VAPID key, so nothing could be delivered anyway. */
  | "unconfigured"
  | "checking"
  /** Supported and available, not subscribed. */
  | "off"
  | "on"
  /** Permission was refused. Only the browser's own settings can undo this. */
  | "blocked";

export type Push = {
  state: PushState;
  /** Local hour 0–23 for the nightly reminder, or null when it is off. */
  reminderHour: number | null;
  busy: boolean;
  /** Asks permission and registers the device. Safe to call when already on. */
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
  setReminderHour: (hour: number | null) => Promise<void>;
};

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/**
 * The VAPID key travels as base64url and `applicationServerKey` wants raw
 * bytes. Padding and the two substituted characters are what differ.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  // Backed by an explicit ArrayBuffer: applicationServerKey takes a
  // BufferSource, which a Uint8Array over a possibly-shared buffer is not.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac; the touch points give it away.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

const timezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const platform = (): string =>
  isIOS() ? "ios" : /android/i.test(navigator.userAgent) ? "android" : "web";

/** The token, when there is a session. Absent for an anonymous device. */
async function authHeader(): Promise<Record<string, string>> {
  const supabase = getSupabase();
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Hands the worker what it cannot look up itself: the language to write a
 * notification in, and the key to re-subscribe with if the push service retires
 * this subscription while no page is open.
 */
function tellWorker(config: Record<string, unknown>): void {
  navigator.serviceWorker?.ready
    .then((reg) => reg.active?.postMessage({ type: "PUSH_CONFIG", config }))
    .catch(() => {});
}

export function usePush(lang: "ar" | "en"): Push {
  const [state, setState] = useState<PushState>("checking");
  const [reminderHour, setHour] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const endpoint = useRef<string | null>(null);

  /* ------------------------------ discovery ------------------------------ */

  useEffect(() => {
    let live = true;

    (async () => {
      if (!VAPID) {
        setState("unconfigured");
        return;
      }
      if (!("serviceWorker" in navigator) || !("Notification" in window)) {
        setState("unsupported");
        return;
      }
      if (!("PushManager" in window)) {
        // The one case worth explaining rather than calling unsupported: on
        // iOS this is not a missing feature, it is a missing Home Screen icon.
        setState(isIOS() && !isStandalone() ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("blocked");
        return;
      }

      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (!live) return;
      if (!reg) {
        setState("unsupported");
        return;
      }

      const sub = await reg.pushManager.getSubscription().catch(() => null);
      if (!live) return;

      if (!sub) {
        setState("off");
        return;
      }

      endpoint.current = sub.endpoint;
      setState("on");

      // The hour lives on the server, not here: a reinstall keeps the push
      // subscription but wipes localStorage, and showing "off" for a reminder
      // that is still scheduled would be a lie.
      try {
        const res = await fetch("/api/push/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        const data = (await res.json()) as { found?: boolean; reminderHour?: number | null };
        if (live && data.found) setHour(data.reminderHour ?? null);
      } catch {
        /* offline — the toggle still shows as on, the hour just reads null */
      }
    })().catch(() => {
      if (live) setState("unsupported");
    });

    return () => {
      live = false;
    };
  }, []);

  /* The worker writes notifications in whichever language the app is set to,
     and only the page knows what that is. Re-sent on every change. */
  useEffect(() => {
    if (state === "unsupported" || state === "unconfigured") return;
    tellWorker({
      lang,
      vapid: VAPID,
      tz: timezone(),
      reminderHour,
      platform: platform(),
    });
  }, [lang, reminderHour, state]);

  /* ------------------------------- register ------------------------------ */

  const register = useCallback(
    async (hour: number | null): Promise<boolean> => {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          // Required by every browser, and enforced by iOS: a push that shows
          // no notification costs the subscription. The worker always shows one.
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID as string),
        });
      }

      endpoint.current = sub.endpoint;

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          tz: timezone(),
          reminderHour: hour,
          platform: platform(),
        }),
      });
      return res.ok;
    },
    [],
  );

  const enable = useCallback(async (): Promise<boolean> => {
    if (busy || !VAPID) return false;
    setBusy(true);
    try {
      // Must be called from the user's tap — Safari discards the prompt
      // otherwise, and the state machine here exists so nothing awaits before
      // this line on the path from the button.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return false;
      }

      const ok = await register(reminderHour);
      setState(ok ? "on" : "off");
      return ok;
    } catch {
      setState("off");
      return false;
    } finally {
      setBusy(false);
    }
  }, [busy, register, reminderHour]);

  const disable = useCallback(async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();

      // Told first, then unsubscribed. The other order would leave a row we can
      // no longer name if the request fails, and the push service would keep
      // accepting messages for an endpoint nobody is listening to.
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      endpoint.current = null;
      setHour(null);
      setState("off");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const setReminderHour = useCallback(
    async (hour: number | null): Promise<void> => {
      setHour(hour);
      // Setting an hour is also how someone turns reminders on for the first
      // time, so this registers rather than assuming a subscription exists.
      if (state === "on" || Notification.permission === "granted") {
        await register(hour).catch(() => {});
        setState("on");
      }
    },
    [register, state],
  );

  return { state, reminderHour, busy, enable, disable, setReminderHour };
}
