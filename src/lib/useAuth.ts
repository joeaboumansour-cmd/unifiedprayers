"use client";

import type { Session, User } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";

import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

export type AuthStatus =
  /** No Supabase project configured — the app runs purely on localStorage. */
  | "disabled"
  | "loading"
  | "signed-out"
  | "signed-in";

export type AuthState = {
  status: AuthStatus;
  user: User | null;
  /** Set after a failed attempt, cleared when a new one starts. */
  error: string | null;
  /** True between asking for a magic link and the user leaving for their mail. */
  linkSent: boolean;
};

export type Auth = AuthState & {
  signInWithEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  reset: () => void;
};

export function useAuth(): Auth {
  const [state, setState] = useState<AuthState>({
    status: isSupabaseConfigured ? "loading" : "disabled",
    user: null,
    error: null,
    linkSent: false,
  });

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    let live = true;
    const apply = (session: Session | null) => {
      if (!live) return;
      setState((s) => ({
        ...s,
        status: session ? "signed-in" : "signed-out",
        user: session?.user ?? null,
        // A completed sign-in makes any pending link notice moot.
        linkSent: session ? false : s.linkSent,
      }));
    };

    // getSession resolves from localStorage first, so a returning user is
    // signed in before the network is touched -- which matters offline. If it
    // rejects outright we still have to leave "loading", or the account UI
    // would never appear at all.
    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch(() => apply(null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      apply(session),
    );

    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const fail = useCallback((error: unknown) => {
    setState((s) => ({
      ...s,
      error: error instanceof Error ? error.message : String(error),
    }));
  }, []);

  const signInWithEmail = useCallback(
    async (email: string) => {
      const supabase = getSupabase();
      if (!supabase) return;
      setState((s) => ({ ...s, error: null, linkSent: false }));
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) return fail(error);
      setState((s) => ({ ...s, linkSent: true }));
    },
    [fail],
  );

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    // Local state is deliberately left alone: signing out should not wipe the
    // palette and progress off a device that was working fine before sign-in.
    const { error } = await supabase.auth.signOut();
    if (error) fail(error);
  }, [fail]);

  const reset = useCallback(
    () => setState((s) => ({ ...s, error: null, linkSent: false })),
    [],
  );

  return { ...state, signInWithEmail, signOut, reset };
}
