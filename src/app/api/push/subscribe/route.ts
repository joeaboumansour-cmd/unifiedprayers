import {
  badRequest,
  callerId,
  json,
  serviceClient,
  unconfigured,
} from "@/lib/server/supabase";
import { cleanTopics } from "@/lib/server/dailyVerse";
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
  /**
   * 0–23 local for the morning message, or null to turn it off.
   *
   * Absent is not the same as null and must not be read as one. The service
   * worker re-subscribes from a config written before this field existed, and
   * an older cached worker will keep doing so — treating a missing key as "off"
   * would quietly cancel the morning message on exactly the devices that never
   * asked for anything to change. Absent means leave whatever is stored.
   */
  morningHour?: unknown;
  /**
   * Daily verse topics: an array of ids from src/data/verses/topics.json, or
   * null for all. Absent means leave what is stored, for the same reason as
   * morningHour — the worker re-subscribes without it.
   */
  verseTopics?: unknown;
  platform?: unknown;
};

/** 0–23, or null. `undefined` means the key was not sent at all. */
function readHour(v: unknown): number | null | undefined | "bad" {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 23) return v;
  return "bad";
}

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

  // The nightly reminder keeps its original contract: absent means off, because
  // that is what every caller has always meant by leaving it out.
  const reminderRaw = readHour(body.reminderHour);
  if (reminderRaw === "bad") return badRequest("bad-hour");
  const reminderHour = reminderRaw ?? null;

  const morningHour = readHour(body.morningHour);
  if (morningHour === "bad") return badRequest("bad-morning-hour");

  // Unknown ids are dropped rather than refused: a topic retired from the list
  // should not stop an older copy of the app from saving the rest.
  if (body.verseTopics !== undefined && body.verseTopics !== null && !Array.isArray(body.verseTopics)) {
    return badRequest("bad-topics");
  }
  const verseTopics = body.verseTopics === undefined ? undefined : cleanTopics(body.verseTopics);

  // Unverified is fine here: the token is proof of who this is, and its absence
  // just means the device is anonymous. It is never proof of anything else.
  const userId = await callerId(req);

  const row = {
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
    // Omitted rather than nulled when the caller did not send it: postgrest
    // only writes the columns present here, so a new row takes the column
    // default (8, on) and an existing one keeps what it had. Topics likewise.
    ...(morningHour !== undefined ? { morning_hour: morningHour } : {}),
    enabled: true,
    // A device coming back after failures gets a clean slate: whatever was
    // failing has clearly stopped, since it just talked to us.
    failures: 0,
    last_seen_at: new Date().toISOString(),
  };

  const store = (r: typeof row & { verse_topics?: string[] | null }) =>
    supabase.from("push_subscriptions").upsert(r, { onConflict: "endpoint" });

  let { error } = await store(verseTopics !== undefined ? { ...row, verse_topics: verseTopics } : row);

  /* Until 0013 is applied the column does not exist, and a subscribe that
     names it fails outright — which would take notifications off for anybody
     who touched a topic. Saved without it instead; the topics simply do not
     stick until the migration runs. Safe to remove once it has, everywhere. */
  if (error && verseTopics !== undefined && /verse_topics/.test(error.message)) {
    ({ error } = await store(row));
  }

  if (error) return json({ error: "store-failed" }, 500);
  return json({ ok: true, reminderHour, signedIn: Boolean(userId) });
}
