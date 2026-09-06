import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

/**
 * The app is an offline-first PWA and must open, and stay fully usable, with
 * no network and no Supabase project at all. So the client is optional: when
 * the env vars are absent every caller gets `null` and falls back to
 * localStorage and the bundled JSON. Nothing here may throw at import time.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let cached: SupabaseClient<Database> | null | undefined;

/**
 * The browser client, or null when the project is not configured.
 *
 * Sessions live in localStorage rather than cookies: no route in this app is
 * server-rendered per user, so cookie storage would only buy us middleware —
 * and middleware would make the shell dynamic, which is exactly what the
 * service worker precache depends on not happening.
 */
export function getSupabase(): SupabaseClient<Database> | null {
  if (cached !== undefined) return cached;
  if (!url || !anonKey) {
    cached = null;
    return cached;
  }
  cached = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // The magic-link / OAuth callback comes back as a URL fragment; let the
      // client consume it so we never hand-parse tokens.
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
  return cached;
}
