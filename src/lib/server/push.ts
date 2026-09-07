import "server-only";

import webpush, { WebPushError } from "web-push";

import type { PushSubscriptionRow } from "@/lib/supabase/types";

import { serviceClient } from "./supabase";

/**
 * Sending Web Push, to Android and iOS alike.
 *
 * There is one protocol here, not two. Chrome on Android and Safari on iOS both
 * speak RFC 8030 Web Push with RFC 8291 encryption and RFC 8292 VAPID, so the
 * same encrypted payload goes to fcm.googleapis.com and to web.push.apple.com
 * with nothing platform-specific in between. No Firebase project, no APNs
 * certificate, no native wrapper.
 *
 * The differences that do exist are on the device, not here:
 *   - iOS delivers Web Push only to a PWA the person added to the Home Screen,
 *     from iOS 16.4. In Safari itself, subscribing is not offered at all.
 *   - iOS requires the notification to be shown when a push arrives. The
 *     service worker always calls showNotification(); a silent push would have
 *     the subscription revoked.
 *   - Payload size is capped around 4KB after encryption, which is why the
 *     payload below carries a URL rather than any content.
 */

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
/**
 * The contact address in the VAPID header. Push services use it to reach the
 * operator if a sender misbehaves; Apple rejects a subscription outright if it
 * is missing or not a mailto:/https: URL.
 */
const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

export const isPushConfigured = Boolean(publicKey && privateKey);

let configured = false;
function ensureConfigured(): boolean {
  if (!publicKey || !privateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  }
  return true;
}

/** What the service worker's `push` handler expects to parse. */
export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  /** Collapses replacements: a second reminder replaces the first on screen. */
  tag?: string;
  /** Echoed back by the notification's own click handler, for counting. */
  id?: string;
};

/**
 * A bilingual message, sent as both languages in one payload.
 *
 * The alternative — storing each device's language and sending one — was
 * rejected because the language lives in localStorage on the device and can
 * change between subscribing and being sent to. The service worker knows the
 * current setting at the moment the push arrives, so it picks; the payload
 * carries both and stays well inside the 4KB budget.
 */
export type BilingualPayload = {
  title_ar: string;
  title_en: string;
  body_ar?: string | null;
  body_en?: string | null;
  url?: string;
  tag?: string;
  id?: string;
};

export type SendReport = {
  sent: number;
  failed: number;
  /** Endpoints the push service says are gone; their rows have been deleted. */
  expired: number;
  /** First failure message, for the admin log. Never shown to a subscriber. */
  error?: string;
};

/** One device and the message written for it. */
export type PersonalisedSend = {
  sub: Pick<PushSubscriptionRow, "id" | "endpoint" | "p256dh" | "auth">;
  payload: BilingualPayload;
};

/**
 * Sends a different payload to each subscription and reconciles the table with
 * what the push services said.
 *
 * The per-device shape exists for the morning message, where the text depends
 * on the streak the account actually has — so grouping devices by a shared
 * payload would mean one group per distinct streak number, and a serial await
 * for each. Encrypting per recipient is what Web Push does regardless: the body
 * is encrypted to that device's own keys either way, so nothing is lost by
 * letting the plaintext differ too.
 *
 * 404 and 410 are the important answers: they mean the subscription is
 * permanently gone — the app was uninstalled, notifications were revoked, the
 * browser data was cleared — and the row is deleted immediately. Anything else
 * is treated as transient and only counted, because a push service having a bad
 * minute should not cost someone their subscription.
 */
export async function sendPersonalised(
  items: PersonalisedSend[],
): Promise<SendReport> {
  if (!ensureConfigured()) {
    return { sent: 0, failed: items.length, expired: 0, error: "vapid-not-configured" };
  }

  const dead: string[] = [];
  let sent = 0;
  let failed = 0;
  let firstError: string | undefined;

  /* Chunked rather than one Promise.all over the whole list: a few thousand
     simultaneous TLS connections is how a serverless function runs out of
     sockets and reports every send as a failure. */
  const CHUNK = 100;
  for (let i = 0; i < items.length; i += CHUNK) {
    const slice = items.slice(i, i + CHUNK);
    const results = await Promise.allSettled(
      slice.map(({ sub: s, payload }) =>
        webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          JSON.stringify(payload),
          {
            // How long the push service holds it for a device that is offline.
            // A day: a prayer reminder that lands three days late is noise.
            TTL: 60 * 60 * 24,
            urgency: "normal",
          },
        ),
      ),
    );

    results.forEach((r, n) => {
      if (r.status === "fulfilled") {
        sent += 1;
        return;
      }
      failed += 1;
      const err = r.reason as WebPushError | Error;
      const status = (err as WebPushError).statusCode;
      if (status === 404 || status === 410) {
        dead.push(slice[n].sub.id);
      } else if (!firstError) {
        firstError = `${status ?? "?"}: ${err.message ?? "unknown"}`.slice(0, 300);
      }
    });
  }

  if (dead.length) {
    const supabase = serviceClient();
    // A failure to tidy up is not a failure to send. The rows stay and are
    // retried next time, where they will report 410 again and be caught here.
    await supabase?.from("push_subscriptions").delete().in("id", dead);
  }

  return { sent, failed, expired: dead.length, error: firstError };
}

/** One payload to many devices — an admin message, or the nightly reminder. */
export async function sendToSubscriptions(
  subs: Pick<PushSubscriptionRow, "id" | "endpoint" | "p256dh" | "auth">[],
  payload: BilingualPayload,
): Promise<SendReport> {
  return sendPersonalised(subs.map((sub) => ({ sub, payload })));
}

/**
 * The subscriptions a notification should reach.
 *
 * `null` userId means everyone, including devices that never signed in — the
 * app is usable without an account, so its reminders are too.
 */
export async function subscriptionsFor(
  userId: string | null,
): Promise<Pick<PushSubscriptionRow, "id" | "endpoint" | "p256dh" | "auth">[]> {
  const supabase = serviceClient();
  if (!supabase) return [];

  const query = supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("enabled", true);

  const { data, error } = userId
    ? await query.eq("user_id", userId)
    : await query;

  if (error || !data) return [];
  return data;
}
