"use client";

import { useEffect, useState } from "react";

/** The link types /auth/confirm knows how to redeem. */
const HANDLED = ["signup", "recovery", "email_change", "magiclink", "invite"];

/**
 * Catches an auth token that arrives at the home page and hands it to
 * /auth/confirm.
 *
 * It should not arrive here at all -- the templates aim at /auth/confirm --
 * but two routes end up here anyway. Supabase silently substitutes the Site
 * URL when a redirect target is not on the allow list, and a recovery email
 * sent by hand from its dashboard carries no target in the first place. Either
 * way the token lands on "/", where nothing would otherwise redeem it, and the
 * person is left looking at the app wondering why they are still signed out.
 *
 * Read synchronously rather than in the effect, so the caller can decline to
 * paint the app for the one frame before the redirect.
 */
export function useStrayAuthToken(): boolean {
  const [stray] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return (
      Boolean(params.get("token_hash")) &&
      HANDLED.includes(params.get("type") || "")
    );
  });

  useEffect(() => {
    if (!stray) return;
    // replace(), not assign(): the spent token has no business in the history
    // stack, where Back would return to it and report a failure.
    window.location.replace(`/auth/confirm${window.location.search}`);
  }, [stray]);

  return stray;
}
