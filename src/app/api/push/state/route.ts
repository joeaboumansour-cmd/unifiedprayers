import { badRequest, json, serviceClient, unconfigured } from "@/lib/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the server has stored for this device.
 *
 * The browser knows whether it holds a push subscription, but not what reminder
 * hour was saved against it — that lives only here. Settings asks on open so
 * the hour it shows is the hour that will actually fire, rather than a copy in
 * localStorage that a reinstall or a second device would quietly disagree with.
 *
 * POST, not GET, so the endpoint travels in a body: it identifies one person's
 * browser and has no business in a URL, a referer header or an access log.
 */
export async function POST(req: Request): Promise<Response> {
  const supabase = serviceClient();
  if (!supabase) return unconfigured();

  let endpoint: unknown;
  try {
    ({ endpoint } = (await req.json()) as { endpoint?: unknown });
  } catch {
    return badRequest("bad-json");
  }
  if (typeof endpoint !== "string" || !endpoint) return badRequest("bad-endpoint");

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("reminder_hour, morning_hour, tz, enabled")
    .eq("endpoint", endpoint)
    .maybeSingle();

  // A row that is not there and a query that failed both mean "nothing known",
  // which the client treats as not subscribed. Neither is worth an error.
  if (error || !data) return json({ found: false });

  return json({
    found: true,
    reminderHour: data.reminder_hour,
    morningHour: data.morning_hour,
    tz: data.tz,
    enabled: data.enabled,
  });
}
