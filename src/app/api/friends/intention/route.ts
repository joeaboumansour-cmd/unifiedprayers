import {
  badRequest,
  callerClient,
  callerId,
  denied,
  json,
  serviceClient,
  unconfigured,
} from "@/lib/server/supabase";
import {
  isPushConfigured,
  sendToSubscriptions,
  subscriptionsFor,
} from "@/lib/server/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The intentions wall, where it needs to reach someone's phone.
 *
 * Two actions, one route, because they are the same shape: call a function in
 * 0016 as the person who tapped, and if it agrees, send the push that the
 * database has no key to send.
 *
 *   post   — a new intention. Every friend is told, once.
 *   prayed — somebody prayed for yours. You are told, once, by them.
 *
 * "Once" is the database's word, not this route's. `post_intention` caps an
 * account at five a day, and `pray_for_intention` returns the author to notify
 * only when the row it inserted was new — so tapping the button twice sends
 * nothing the second time, and no counter here has to be trusted to know that.
 *
 * Everything that writes goes through `callerClient`, never the secret key.
 * The secret key appears below only to read push endpoints, which is the one
 * thing RLS will not hand to a browser (0004).
 */

/** Free text from one person, delivered to another's lock screen. See nudge. */
function speakableName(displayName: string | null, username: string): string {
  const raw = (displayName || username || "").replace(/\s+/g, " ").trim();
  return raw.slice(0, 40) || "A friend";
}

/**
 * An intention, quoted in a notification.
 *
 * Shortened hard: the point of the push is that something was shared, not to
 * deliver the whole of it to a lock screen where it sits unlocked and visible
 * to whoever picks the phone up. The wall is where it is read.
 */
function preview(body: string): string {
  const clean = body.replace(/\s+/g, " ").trim();
  return clean.length > 90 ? `${clean.slice(0, 89)}…` : clean;
}

type Body = { action?: unknown; body?: unknown; intention?: unknown };

export async function POST(req: Request): Promise<Response> {
  const service = serviceClient();
  if (!service) return unconfigured();

  const uid = await callerId(req);
  const caller = callerClient(req);
  if (!uid || !caller) return denied();

  let input: Body;
  try {
    input = (await req.json()) as Body;
  } catch {
    return badRequest("bad-json");
  }

  const { data: me } = await service
    .from("profiles")
    .select("username, display_name")
    .eq("id", uid)
    .maybeSingle();
  const name = speakableName(me?.display_name ?? null, me?.username ?? "");

  /* ------------------------------- post -------------------------------- */
  if (input.action === "post") {
    if (typeof input.body !== "string" || !input.body.trim()) {
      return badRequest("body-required");
    }

    const { data: id, error } = await caller.rpc("post_intention", {
      body: input.body,
    });
    if (error) {
      // P0001 covers both "empty" and "that is enough for one day"; the app
      // only ever shows the second, since it does not offer to post an empty
      // one in the first place.
      const map: Record<string, [string, number]> = {
        P0001: ["limit", 429],
        "28000": ["signed-out", 401],
      };
      const [what, status] = map[error.code ?? ""] ?? ["failed", 400];
      return json({ error: what }, status);
    }

    if (!isPushConfigured) return json({ ok: true, id, delivered: 0 });

    /* Who to tell. Read as the caller, so the list is the friends RLS agrees
       they have — this route never gets to choose an audience. */
    const { data: friends } = await caller.rpc("friends_overview");
    const ids = (friends ?? []).map((f) => f.user_id);
    if (!ids.length) return json({ ok: true, id, delivered: 0 });

    /* One query for every friend's devices rather than one per friend. A
       person with two hundred friends would otherwise be two hundred round
       trips inside a single tap. */
    const { data: subs } = await service
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("enabled", true)
      .in("user_id", ids);

    const report = await sendToSubscriptions(subs ?? [], {
      title_ar: `${name} يطلب صلاتكم`,
      title_en: `${name} asked for prayers`,
      body_ar: preview(input.body),
      body_en: preview(input.body),
      url: "/?tab=friends",
      tag: "up-intention",
    });

    return json({ ok: true, id, delivered: report.sent });
  }

  /* ------------------------------ prayed ------------------------------- */
  if (input.action === "prayed") {
    if (typeof input.intention !== "string" || !input.intention) {
      return badRequest("intention-required");
    }

    const { data: author, error } = await caller.rpc("pray_for_intention", {
      intention: input.intention,
    });
    if (error) {
      const map: Record<string, [string, number]> = {
        P0002: ["gone", 404],
        "28000": ["signed-out", 401],
      };
      const [what, status] = map[error.code ?? ""] ?? ["failed", 400];
      return json({ error: what }, status);
    }

    // Null means there is nobody to tell: it was already prayed for by this
    // account, or it is their own intention. Both are successes with no push.
    if (!author || !isPushConfigured) return json({ ok: true, delivered: 0 });

    const subs = await subscriptionsFor(author);
    const report = await sendToSubscriptions(subs, {
      title_ar: `${name} صلّى من أجل نيّتك`,
      title_en: `${name} prayed for your intention`,
      body_ar: "لست وحدك في هذا.",
      body_en: "You are not carrying it alone.",
      url: "/?tab=friends",
      tag: "up-prayed",
    });

    return json({ ok: true, delivered: report.sent });
  }

  return badRequest("unknown-action");
}
