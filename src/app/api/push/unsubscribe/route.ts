import { badRequest, json, serviceClient, unconfigured } from "@/lib/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Forgets a device.
 *
 * No auth. The endpoint is a long unguessable URL issued by the push service to
 * one browser, and knowing it is the only thing that could plausibly be
 * required — a signed-out device has nothing else to offer. The worst an
 * attacker who somehow held an endpoint could do is stop that device's
 * notifications, which is the same thing its owner can do in browser settings.
 *
 * Deleting rather than disabling: the person asked to be forgotten, and a
 * disabled row is a record of a device that asked not to be recorded.
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

  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  // Answered the same way whether a row was there or not: telling the caller
  // which endpoints are registered is not something this route should do.
  return json({ ok: true });
}
