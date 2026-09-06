import {
  adminId,
  badRequest,
  denied,
  json,
  serviceClient,
  unconfigured,
} from "@/lib/server/supabase";
import { isPushConfigured, sendToSubscriptions, subscriptionsFor } from "@/lib/server/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Composing and sending a notification. Admin only, checked here rather than
 * relying on the tab being hidden — the tab is UI, this is the boundary.
 *
 * Two outcomes from one route: a message with no scheduled_at is delivered
 * before the response returns, and one with a future scheduled_at is written as
 * 'scheduled' for the cron to pick up. Both leave a row behind either way, so
 * the admin log is the whole history rather than only the parts that worked.
 */

const trim = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
};

type Body = {
  title_ar?: unknown;
  title_en?: unknown;
  body_ar?: unknown;
  body_en?: unknown;
  url?: unknown;
  audience?: unknown;
  target_user_id?: unknown;
  /** ISO string. Absent or null sends immediately. */
  scheduled_at?: unknown;
};

/** Subscriber counts for the admin tab's header. */
export async function GET(req: Request): Promise<Response> {
  const supabase = serviceClient();
  if (!supabase) return unconfigured();
  if (!(await adminId(req))) return denied();

  const total = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("enabled", true);

  const identified = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("enabled", true)
    .not("user_id", "is", null);

  return json({
    devices: total.count ?? 0,
    // The rest are devices that subscribed without signing in. They can be sent
    // to as part of "everyone" but never targeted by account.
    signedIn: identified.count ?? 0,
    pushConfigured: isPushConfigured,
  });
}

export async function POST(req: Request): Promise<Response> {
  const supabase = serviceClient();
  if (!supabase) return unconfigured();

  const admin = await adminId(req);
  if (!admin) return denied();
  if (!isPushConfigured) return json({ error: "vapid-not-configured" }, 503);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return badRequest("bad-json");
  }

  const title_ar = trim(body.title_ar, 120);
  const title_en = trim(body.title_en, 120);
  // Both languages, always. The service worker picks one at delivery time
  // using the setting on the device, so a missing half is a blank notification
  // for whoever reads in that language.
  if (!title_ar || !title_en) return badRequest("title-required");

  const url = trim(body.url, 300) || "/";
  if (!/^(\/|https:\/\/)/.test(url)) return badRequest("bad-url");

  const audience = body.audience === "user" ? "user" : "all";
  const target =
    audience === "user" ? trim(body.target_user_id, 40) : null;
  if (audience === "user" && !target) return badRequest("target-required");

  let scheduledAt: string | null = null;
  if (body.scheduled_at) {
    const when = new Date(String(body.scheduled_at));
    if (Number.isNaN(when.getTime())) return badRequest("bad-schedule");
    // A minute of slack: a time picked as "now" arrives here a few seconds
    // later, and that should send rather than be rejected as the past.
    if (when.getTime() > Date.now() + 60_000) scheduledAt = when.toISOString();
  }

  const row = {
    title_ar,
    title_en,
    body_ar: trim(body.body_ar, 500),
    body_en: trim(body.body_en, 500),
    url,
    audience: audience as "all" | "user",
    target_user_id: target,
    scheduled_at: scheduledAt,
    status: (scheduledAt ? "scheduled" : "sending") as "scheduled" | "sending",
    created_by: admin,
  };

  const { data: created, error } = await supabase
    .from("notifications")
    .insert(row)
    .select("id")
    .single();

  if (error || !created) return json({ error: "store-failed" }, 500);

  // Scheduled: written and done. The cron owns it from here.
  if (scheduledAt) {
    return json({ ok: true, id: created.id, status: "scheduled", scheduledAt });
  }

  const subs = await subscriptionsFor(target);
  const report = await sendToSubscriptions(subs, {
    title_ar,
    title_en,
    body_ar: row.body_ar,
    body_en: row.body_en,
    url,
    id: created.id,
    // Each message replaces the previous one from the same admin send rather
    // than stacking. A tag per row, so two different messages both show.
    tag: `up-${created.id}`,
  });

  // 'sent' even when some endpoints failed: the message went out. Only a send
  // where nothing at all landed, with subscribers to land on, is a failure.
  const status = report.sent === 0 && subs.length > 0 ? "failed" : "sent";

  await supabase
    .from("notifications")
    .update({
      status,
      sent_at: new Date().toISOString(),
      sent_count: report.sent,
      failed_count: report.failed,
      error: report.error ?? null,
    })
    .eq("id", created.id);

  return json({
    ok: status === "sent",
    id: created.id,
    status,
    sent: report.sent,
    failed: report.failed,
    expired: report.expired,
    error: report.error ?? null,
  });
}
