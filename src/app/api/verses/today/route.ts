import { badRequest, json, serviceClient } from "@/lib/server/supabase";
import { pickVerse, verseFor } from "@/lib/server/dailyVerse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The verse for the top of the Today tab.
 *
 * Two ways in, one answer:
 *
 *   { ref, topic }   the notification was tapped. Its link names the verse it
 *                    carried, and that exact verse is what the reader expects
 *                    to find — even if they changed their topics since.
 *
 *   { endpoint }     the app was opened some other way. The device's own
 *                    subscription says its topics and timezone, and the same
 *                    function the cron sends with picks the same verse, so
 *                    somebody who swiped the notification away still finds it.
 *
 * A device with notifications or the daily verse off gets nothing: the verse
 * is something they asked for, not something the app pushes on everybody.
 *
 * POST, so the endpoint travels in a body and not in a URL or an access log.
 */

/** The calendar date on a device, in its own timezone. */
function localDate(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date());
  }
}

export async function POST(req: Request): Promise<Response> {
  let body: { ref?: unknown; topic?: unknown; endpoint?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return badRequest("bad-json");
  }

  if (typeof body.ref === "string" && typeof body.topic === "string") {
    const verse = verseFor(body.ref, body.topic);
    return json({ verse });
  }

  if (typeof body.endpoint !== "string" || !body.endpoint) return badRequest("bad-request");

  const supabase = serviceClient();
  if (!supabase) return json({ verse: null });

  // `*` for the same reason as /api/push/state: verse_topics may not exist yet.
  const { data } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("endpoint", body.endpoint)
    .maybeSingle();

  if (!data || !data.enabled || data.morning_hour === null) return json({ verse: null });

  const verse = pickVerse(data.id, data.verse_topics ?? null, localDate(data.tz));
  return json({ verse });
}
