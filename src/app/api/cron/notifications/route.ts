import { timingSafeEqual } from "node:crypto";

import { denied, json, serviceClient, unconfigured } from "@/lib/server/supabase";
import {
  isPushConfigured,
  sendPersonalised,
  sendToSubscriptions,
  subscriptionsFor,
} from "@/lib/server/push";
import { notificationFor, pickVerse, verseUrl } from "@/lib/server/dailyVerse";
import type {
  DailyReminderSetting,
  MorningDueRow,
  MorningSetting,
  PushSubscriptionRow,
} from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Sending to every subscriber can take a while; the default 10s is not enough. */
export const maxDuration = 60;

/**
 * The clock. Three jobs, one endpoint, run every hour:
 *
 *   1. scheduled messages — an admin picked a time, it has passed, send it.
 *   2. the nightly reminder — each device asked for an hour in its own
 *      timezone, and somewhere in the world it is now that hour.
 *   3. the daily verse — the same idea, at a separate hour, with a verse
 *      chosen from the topics that device picked in Settings.
 *
 * All three are idempotent, which matters more than it sounds: cron delivery is
 * at-least-once, and a retry after a timeout must not send everything twice.
 * Scheduled messages are claimed by moving them to 'sending' before anything
 * goes out; the two daily sweeps are guarded by last_remind and last_morning
 * holding the device's own local date. Running this twice in the same hour
 * sends nothing the second time.
 */

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; Supabase pg_cron can
 * set the same header through pg_net. Anything else is refused — this endpoint
 * pushes to every subscriber, and an unauthenticated one would be a spam button
 * with a public URL.
 *
 * No secret configured means no caller can be authenticated, so nothing runs.
 * Failing closed is the only safe direction for a route like this.
 */
function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  // timingSafeEqual throws on a length mismatch, which is itself a leak of the
  // secret's length; comparing lengths first and returning the same way keeps
  // the answer to "was it right" the only thing observable.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** The calendar date on a device, in its own timezone. */
function localDate(tz: string, now = new Date()): string {
  try {
    // en-CA formats as YYYY-MM-DD, which is what the date column wants.
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(now);
  }
}

const FALLBACK_REMINDER: DailyReminderSetting = {
  title_ar: "وقت الصلاة",
  title_en: "Time to pray",
  body_ar: "خذ لحظة مع الروح القدس.",
  body_en: "Take a moment with the Holy Spirit.",
  url: "/",
};

async function runScheduled(): Promise<{ processed: number; sent: number }> {
  const supabase = serviceClient();
  if (!supabase) return { processed: 0, sent: 0 };

  const { data: due } = await supabase
    .from("notifications")
    .select("id, title_ar, title_en, body_ar, body_en, url, audience, target_user_id")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    // A backlog is processed a slice at a time rather than all at once, so one
    // long run cannot push the function past its timeout and lose the lot.
    .limit(20);

  if (!due?.length) return { processed: 0, sent: 0 };

  let processed = 0;
  let sent = 0;

  for (const n of due) {
    // Claim it first. The filter on status is the claim: a second worker
    // running concurrently updates zero rows and skips this message.
    const { data: claimed } = await supabase
      .from("notifications")
      .update({ status: "sending" })
      .eq("id", n.id)
      .eq("status", "scheduled")
      .select("id");

    if (!claimed?.length) continue;
    processed += 1;

    const subs = await subscriptionsFor(
      n.audience === "user" ? n.target_user_id : null,
    );
    const report = await sendToSubscriptions(subs, {
      title_ar: n.title_ar,
      title_en: n.title_en,
      body_ar: n.body_ar,
      body_en: n.body_en,
      url: n.url,
      id: n.id,
      tag: `up-${n.id}`,
    });
    sent += report.sent;

    await supabase
      .from("notifications")
      .update({
        status: report.sent === 0 && subs.length > 0 ? "failed" : "sent",
        sent_at: new Date().toISOString(),
        sent_count: report.sent,
        failed_count: report.failed,
        error: report.error ?? null,
      })
      .eq("id", n.id);
  }

  return { processed, sent };
}

async function runReminders(): Promise<{ due: number; sent: number }> {
  const supabase = serviceClient();
  if (!supabase) return { due: 0, sent: 0 };

  const { data: due, error } = await supabase.rpc("due_daily_reminders");
  if (error || !due?.length) return { due: 0, sent: 0 };

  const subs = due as PushSubscriptionRow[];

  const { data: setting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "daily_reminder")
    .maybeSingle();

  const copy = {
    ...FALLBACK_REMINDER,
    ...((setting?.value as Partial<DailyReminderSetting> | null) ?? {}),
  };

  const report = await sendToSubscriptions(subs, {
    title_ar: copy.title_ar,
    title_en: copy.title_en,
    body_ar: copy.body_ar,
    body_en: copy.body_en,
    url: copy.url || "/",
    // One tag for every reminder, so tonight's replaces last night's on a
    // phone that was never picked up, instead of stacking into a wall of them.
    tag: "up-daily",
  });

  /* Marked after the send, and marked for every device that was tried rather
     than only those that succeeded. sendToSubscriptions does not report which
     endpoint failed, and a device that misses one night is a far smaller
     problem than one that gets reminded every hour until a transient failure
     clears. Dead endpoints were already deleted by the sender. */
  const now = new Date();
  const byDate = new Map<string, string[]>();
  for (const s of subs) {
    const date = localDate(s.tz, now);
    const list = byDate.get(date);
    if (list) list.push(s.id);
    else byDate.set(date, [s.id]);
  }
  for (const [date, ids] of byDate) {
    await supabase
      .from("push_subscriptions")
      .update({ last_remind: date })
      .in("id", ids);
  }

  return { due: subs.length, sent: report.sent };
}

/**
 * The daily verse.
 *
 * Shaped like the reminder sweep above and different in one way that changes
 * the plumbing: every device gets its own text. The topics come back with the
 * row, the verse is picked against them and the device's own date, and the
 * send is per-device rather than one payload fanned out.
 *
 * The switch in app_settings (still keyed `morning_message`, which is what the
 * admin panel and every existing database call it) is a real one. This pushes
 * to every subscriber every day, which is the kind of thing that should be
 * stoppable without a deploy; a missing row means on.
 */
async function runMorning(): Promise<{ due: number; sent: number }> {
  const supabase = serviceClient();
  if (!supabase) return { due: 0, sent: 0 };

  const { data: setting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "morning_message")
    .maybeSingle();

  const config = (setting?.value as Partial<MorningSetting> | null) ?? {};
  if (config.enabled === false) return { due: 0, sent: 0 };

  const { data: due, error } = await supabase.rpc("due_morning_messages");
  if (error || !due?.length) return { due: 0, sent: 0 };

  const rows = due as MorningDueRow[];
  const now = new Date();

  const items = rows.map((row) => {
    const verse = pickVerse(row.id, row.verse_topics, localDate(row.tz, now));
    return {
      sub: row,
      payload: {
        ...notificationFor(verse),
        // Tapping opens the Today tab on the whole verse; the notification
        // may have had to cut it short.
        url: verseUrl(verse),
        // One tag for the morning message, as the reminder has one: a phone
        // left untouched for three days shows today's verse, not three.
        tag: "up-morning",
      },
    };
  });

  const report = await sendPersonalised(items);

  /* Marked for every device tried, not only the successes, and for the same
     reason the reminder is: the sender does not say which endpoint failed, and
     a missed morning is a much smaller problem than being greeted every hour
     until a transient failure clears. */
  const byDate = new Map<string, string[]>();
  for (const row of rows) {
    const date = localDate(row.tz, now);
    const list = byDate.get(date);
    if (list) list.push(row.id);
    else byDate.set(date, [row.id]);
  }
  for (const [date, ids] of byDate) {
    await supabase
      .from("push_subscriptions")
      .update({ last_morning: date })
      .in("id", ids);
  }

  return { due: rows.length, sent: report.sent };
}

export async function GET(req: Request): Promise<Response> {
  if (!authorised(req)) return denied();

  const supabase = serviceClient();
  if (!supabase) return unconfigured();
  if (!isPushConfigured) return json({ error: "vapid-not-configured" }, 503);

  const scheduled = await runScheduled();
  const reminders = await runReminders();
  const morning = await runMorning();

  return json({ ok: true, scheduled, reminders, morning });
}

/** pg_net sends POST more naturally than GET; same job either way. */
export const POST = GET;
