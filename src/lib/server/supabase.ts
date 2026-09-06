import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

/**
 * The server-side Supabase client, holding the secret key.
 *
 * `server-only` above is not decoration: this module is one bad import away
 * from putting a key that bypasses every RLS policy into the browser bundle,
 * and that import makes the build fail instead of shipping it.
 *
 * Everything under /api that touches push subscriptions goes through here,
 * because those rows have RLS on and no policies at all — the secret key is the
 * only thing that can read or write them. See supabase/migrations/0004.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

let cached: SupabaseClient<Database> | null | undefined;

/** Null when the server has no secret key — every route reports 503 then. */
export function serviceClient(): SupabaseClient<Database> | null {
  if (cached !== undefined) return cached;
  if (!url || !secret) {
    cached = null;
    return cached;
  }
  cached = createClient<Database>(url, secret, {
    // No session to persist and nothing to refresh: this client is one request
    // long and authenticates with a static key.
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/* ------------------------------- callers --------------------------------- */

/** The bearer token on the request, or null. */
export function bearer(req: Request): string | null {
  const header = req.headers.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  if (!token || scheme.toLowerCase() !== "bearer") return null;
  return token.trim() || null;
}

/**
 * The user the request is acting as, verified against Supabase.
 *
 * The token is checked by asking Supabase who it belongs to rather than by
 * decoding it here. A JWT this process did not sign is a claim, not a fact, and
 * verifying it locally would mean holding the signing key and keeping the
 * expiry, issuer and revocation checks correct by hand.
 */
export async function callerId(req: Request): Promise<string | null> {
  const token = bearer(req);
  const supabase = serviceClient();
  if (!token || !supabase) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * The caller's id if they are an admin, otherwise null.
 *
 * Checked server-side on every admin route even though the admin tab is only
 * rendered for admins. The tab is a convenience; this is the control. A signed
 * -in non-admin can call these routes by hand, and this is what answers them.
 */
export async function adminId(req: Request): Promise<string | null> {
  const uid = await callerId(req);
  const supabase = serviceClient();
  if (!uid || !supabase) return null;

  const { data, error } = await supabase
    .from("app_admins")
    .select("user_id")
    .eq("user_id", uid)
    .maybeSingle();

  if (error || !data) return null;
  return uid;
}

/* -------------------------------- replies -------------------------------- */

/** JSON with no store — none of these responses may sit in a cache. */
export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

/**
 * One shape for every refusal, and never a reason. "Not an admin" and "bad
 * token" answering differently is how someone maps the accounts that matter.
 */
export const denied = () => json({ error: "denied" }, 403);
export const unconfigured = () => json({ error: "unconfigured" }, 503);
export const badRequest = (what: string) => json({ error: what }, 400);
