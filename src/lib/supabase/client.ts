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
      // Implicit, not PKCE, and the reason is the confirmation email.
      //
      // Under PKCE the token hash Supabase puts in an auth email is prefixed
      // "pkce_", and redeeming it yields an authorisation code that still has
      // to be exchanged using a verifier held in the localStorage of the
      // browser that started the request. Mail is not read in that browser.
      // Phones open links in the mail app's own in-app browser, and desktop
      // webmail is frequently a different browser than the app was used in.
      // The verify call still lands server-side -- the address does get
      // confirmed -- but no session comes back, so the person is told the link
      // failed while their account is quietly activated behind them.
      //
      // Implicit issues a plain token hash that /auth/confirm can redeem
      // anywhere. Nothing here uses OAuth or magic links, which are the flows
      // PKCE exists to protect, so this costs us nothing we were using.
      flowType: "implicit",
    },
  });
  return cached;
}
