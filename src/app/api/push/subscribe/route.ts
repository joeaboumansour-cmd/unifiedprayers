import {
  badRequest,
  callerId,
  json,
  serviceClient,
  unconfigured,
} from "@/lib/server/supabase";
import { isPushConfigured } from "@/lib/server/push";

/** web-push needs node crypto; it does not run on the edge runtime. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Registers a device for push, or updates what it already registered.
 *
 * Called with a bearer token when there is a session and without one when there
 * is not, and both are fine — a device that never signed in still gets
 * reminders. Signing in later simply re-subscribes and the row picks up a
 * user_id, which is what makes "send to this account" find it.
 */

/**
 * Endpoints are only accepted for push services we know. The server POSTs to
 * whatever URL is stored here, so an unchecked endpoint would turn this route
 * into a request forwarder pointed at any host someone likes. Add to the list
 * when a new browser appears; the cost of that is one line.
 */
const PUSH_HOSTS = [
  "web.push.apple.com", // Safari, iOS and macOS
  "fcm.googleapis.com", // Chrome, Edge on Chromium, Android
  "android.googleapis.com", // older Chrome
  ".notify.windows.com", // Edge, legacy WNS
  ".push.services.mozilla.com", // Firefox
];

function isPushEndpoint(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 1000) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return PUSH_HOSTS.some((h) =>
    h.startsWith(".") ? url.hostname.endsWith(h) : url.hostname === h,
  );
}

/**
 * An IANA name the database will accept. Postgres raises on an unknown zone and
 * the nightly sweep reads every row, so one bad string would stop everyone's
 * reminder — hence checking here rather than trusting the browser's answer.
 */
function isTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 60) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

type Body = {
  subscription?: {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  tz?: unknown;
  /** 0–23 local, or null to leave the nightly reminder off. */
  reminderHour?: unknown;
  platform?: unknown;
};

export async function POST(req: Request): Promise<Response> {
  const supabase = serviceClient();
  if (!supabase || !isPushConfigured) return unconfigured();

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return badRequest("bad-json");
  }

  const endpoint = body.subscription?.endpoint;
  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;

  if (!isPushEndpoint(endpoint)) return badRequest("bad-endpoint");
  if (typeof p256dh !== "string" || typeof auth !== "string") {
    return badRequest("bad-keys");
  }
  if (p256dh.length > 200 || auth.length > 100) return badRequest("bad-keys");

  const hour = body.reminderHour;
  const reminderHour =
    hour === null || hour === undefined
      ? null
      : typeof hour === "number" && Number.isInteger(hour) && hour >= 0 && hour <= 23
        ? hour
        : undefined;
  if (reminderHour === undefined) return badRequest("bad-hour");

  // Unverified is fine here: the token is proof of who this is, and its absence
  // just means the device is anonymous. It is never proof of anything else.
  const userId = await callerId(req);

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint,
      p256dh,
      auth,
      // Trimmed hard — this is for a line of text in the admin list, not
      // analytics, and there is no reason to store a full UA string.
      user_agent: (req.headers.get("user-agent") || "").slice(0, 200) || null,
      platform:
        typeof body.platform === "string" ? body.platform.slice(0, 40) : null,
      tz: isTimezone(body.tz) ? body.tz : "UTC",
      reminder_hour: reminderHour,
      enabled: true,
      // A device coming back after failures gets a clean slate: whatever was
      // failing has clearly stopped, since it just talked to us.
      failures: 0,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) return json({ error: "store-failed" }, 500);
  return json({ ok: true, reminderHour, signedIn: Boolean(userId) });
}
