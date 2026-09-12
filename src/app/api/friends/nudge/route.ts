import {
  badRequest,
  callerClient,
  callerId,
  denied,
  json,
  serviceClient,
  unconfigured,
} from "@/lib/server/supabase";
import { isPushConfigured, sendToSubscriptions, subscriptionsFor } from "@/lib/server/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The bell beside a friend's name.
 *
 * The route is split from the rule on purpose. `nudge_friend` in
 * 0016_friends.sql decides whether a ring is allowed — are these two actually
 * friends, and has an hour passed — and it is called here through
 * `callerClient`, as the person who tapped, so this route cannot talk its way
 * past either check. What the route adds is the one thing the database cannot
 * do: it holds the VAPID key, so it can turn an allowed ring into a push.
 *
 * The order matters and is not an accident. Record first, send second. A send
 * that fails leaves the ring recorded and the hour spent, which is the safe
 * way round: the alternative is a bell that can be hammered whenever a push
 * service is having a bad minute.
 */

/**
 * A name to put in someone else's notification.
 *
 * Display names are free text (0002 caps them at 40 characters and nothing
 * else), and this one is being written into a message delivered to a different
 * person's lock screen. Newlines are stripped because a notification body is
 * the one place a person could otherwise forge a second line, and the whole
 * thing is clamped well inside the 4KB payload budget.
 */
function speakableName(displayName: string | null, username: string): string {
  const raw = (displayName || username || "").replace(/\s+/g, " ").trim();
  return raw.slice(0, 40) || "A friend";
}

export async function POST(req: Request): Promise<Response> {
  const service = serviceClient();
  if (!service) return unconfigured();

  const uid = await callerId(req);
  const caller = callerClient(req);
  if (!uid || !caller) return denied();

  let target: unknown;
  try {
    ({ target } = (await req.json()) as { target?: unknown });
  } catch {
    return badRequest("bad-json");
  }
  if (typeof target !== "string" || !target) return badRequest("target-required");

  // The rule, enforced where it lives. Everything below this line only runs
  // because the database agreed.
  const { error } = await caller.rpc("nudge_friend", { target });
  if (error) {
    // The errcodes are documented in 0016. They are passed through rather than
    // flattened because the difference genuinely matters to the person holding
    // the phone: "wait a while" is not "you are not friends".
    const map: Record<string, [string, number]> = {
      "23505": ["too-soon", 429],
      P0002: ["not-friends", 403],
      "28000": ["signed-out", 401],
    };
    const [what, status] = map[error.code ?? ""] ?? ["failed", 400];
    return json({ error: what }, status);
  }

  // Rung, and recorded. From here a failure to deliver is reported but does not
  // undo the ring — see the header.
  if (!isPushConfigured) return json({ ok: true, delivered: 0 });

  const { data: me } = await service
    .from("profiles")
    .select("username, display_name")
    .eq("id", uid)
    .maybeSingle();

  const name = speakableName(me?.display_name ?? null, me?.username ?? "");

  const subs = await subscriptionsFor(target);
  const report = await sendToSubscriptions(subs, {
    title_ar: `${name} يدعوك إلى الصلاة`,
    title_en: `${name} is inviting you to pray`,
    body_ar: "خذ لحظة معًا اليوم.",
    body_en: "Take a moment together today.",
    url: "/",
    // Collapses on the lock screen: two friends ringing an hour apart should
    // not stack into a column of near-identical notifications.
    tag: "up-nudge",
  });

  return json({ ok: true, delivered: report.sent });
}
