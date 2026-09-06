"use client";

import type { Session, User } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";

import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { normalisePhone, normaliseUsername } from "@/lib/username";

export type AuthStatus =
  /** No Supabase project configured — the app runs purely on localStorage. */
  | "disabled"
  | "loading"
  | "signed-out"
  | "signed-in";

/**
 * Every call returns one of these rather than throwing. `message` is already
 * written for the person reading it, in their language, and is deliberately
 * vague wherever being specific would answer a question an attacker asked.
 */
export type AuthResult = { ok: true } | { ok: false; message: string };

export type SignUpInput = {
  email: string;
  password: string;
  username: string;
  displayName?: string;
  phone?: string;
};

export type Auth = {
  status: AuthStatus;
  user: User | null;
  /** True when this page load came from a password-reset link. */
  recovering: boolean;
  /** Seconds the sign-in form should stay disabled after repeated failures. */
  lockedForSeconds: number;
  signIn: (email: string, password: string, lang: Lang) => Promise<AuthResult>;
  signUp: (input: SignUpInput, lang: Lang) => Promise<AuthResult>;
  requestPasswordReset: (email: string, lang: Lang) => Promise<AuthResult>;
  updatePassword: (password: string, lang: Lang) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

type Lang = "ar" | "en";

/* --------------------------- failure throttling --------------------------- */

/**
 * A local brake on repeated failed sign-ins. This is UX, not a security
 * control -- anyone can clear it by reloading, and the real limit is the one
 * Supabase applies at its own endpoints. It is here so that a person (or a
 * script pointed at this form) stops hammering, and so the delay is visible
 * rather than silent.
 */
const FAILURES_BEFORE_LOCK = 5;
const LOCK_SECONDS = 30;

/* --------------------------------- copy ---------------------------------- */

const T = {
  ar: {
    // One message for "no such account" and "wrong password" alike. Telling
    // them apart is how an attacker learns which addresses are registered.
    badCredentials: "البريد الإلكتروني أو كلمة السر غير صحيحة.",
    unconfirmed: "لم يتم تأكيد بريدك بعد. تفقّد رسالة التأكيد.",
    usernameTaken: "اسم المستخدم محجوز، جرّب غيره.",
    phoneTaken: "رقم الهاتف مستخدم في حساب آخر.",
    locked: "محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.",
    offline: "تعذّر الاتصال. تحقق من الشبكة وحاول مجددًا.",
    weakPassword: "كلمة السر ضعيفة أو مكشوفة في تسريب معروف. اختر واحدة أخرى.",
    generic: "تعذّر إتمام الطلب. حاول مجددًا.",
  },
  en: {
    badCredentials: "That email or password is incorrect.",
    unconfirmed: "Your email is not confirmed yet — check for the confirmation message.",
    usernameTaken: "That username is taken, try another.",
    phoneTaken: "That phone number is already on another account.",
    locked: "Too many attempts. Wait a moment and try again.",
    offline: "Could not reach the server. Check your connection and try again.",
    weakPassword: "That password is too weak, or appears in a known breach. Choose another.",
    generic: "Something went wrong. Please try again.",
  },
} as const;

/** Maps a Supabase error onto copy, without ever echoing the raw message. */
function explain(error: { message?: string; code?: string } | null, lang: Lang): string {
  const t = T[lang];
  const raw = (error?.message || "").toLowerCase();
  const code = error?.code || "";

  if (raw.includes("failed to fetch") || raw.includes("network")) return t.offline;
  if (code === "email_not_confirmed" || raw.includes("not confirmed")) return t.unconfirmed;
  if (code === "invalid_credentials" || raw.includes("invalid login")) return t.badCredentials;
  if (code === "weak_password" || raw.includes("pwned") || raw.includes("weak")) {
    return t.weakPassword;
  }
  if (code === "over_request_rate_limit" || raw.includes("rate limit")) return t.locked;
  // The signup trigger raises these when a username or phone is already held.
  if (raw.includes("profiles_username_key") || raw.includes("username")) {
    return t.usernameTaken;
  }
  if (raw.includes("user_private_phone_key") || raw.includes("phone")) return t.phoneTaken;
  return t.generic;
}

export function useAuth(): Auth {
  const [status, setStatus] = useState<AuthStatus>(
    isSupabaseConfigured ? "loading" : "disabled",
  );
  const [user, setUser] = useState<User | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [lockedForSeconds, setLockedForSeconds] = useState(0);

  const failures = useRef(0);
  const lockedUntil = useRef(0);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    let live = true;
    const apply = (session: Session | null) => {
      if (!live) return;
      setStatus(session ? "signed-in" : "signed-out");
      setUser(session?.user ?? null);
    };

    // Resolves from localStorage before the network is touched, so a returning
    // user is signed in even offline. A rejection still has to leave "loading",
    // or the account UI would never appear at all.
    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch(() => apply(null));

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Fired when the link from a reset email is opened. The session it comes
      // with is real but exists only to authorise setting a new password.
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      apply(session);
    });

    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Ticks the visible countdown while the form is locked.
  useEffect(() => {
    if (lockedForSeconds <= 0) return;
    const id = window.setInterval(() => {
      const left = Math.ceil((lockedUntil.current - Date.now()) / 1000);
      setLockedForSeconds(left > 0 ? left : 0);
    }, 500);
    return () => window.clearInterval(id);
  }, [lockedForSeconds]);

  const noteFailure = useCallback(() => {
    failures.current += 1;
    if (failures.current >= FAILURES_BEFORE_LOCK) {
      lockedUntil.current = Date.now() + LOCK_SECONDS * 1000;
      setLockedForSeconds(LOCK_SECONDS);
      failures.current = 0;
    }
  }, []);

  const signIn = useCallback(
    async (email: string, password: string, lang: Lang): Promise<AuthResult> => {
      const supabase = getSupabase();
      if (!supabase) return { ok: false, message: T[lang].generic };
      if (Date.now() < lockedUntil.current) {
        return { ok: false, message: T[lang].locked };
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        noteFailure();
        return { ok: false, message: explain(error, lang) };
      }
      failures.current = 0;
      return { ok: true };
    },
    [noteFailure],
  );

  const signUp = useCallback(
    async (input: SignUpInput, lang: Lang): Promise<AuthResult> => {
      const supabase = getSupabase();
      if (!supabase) return { ok: false, message: T[lang].generic };

      const phone = input.phone ? normalisePhone(input.phone) : "";
      const { error } = await supabase.auth.signUp({
        email: input.email.trim().toLowerCase(),
        password: input.password,
        options: {
          // Read by handle_new_user() to build the profile row in the same
          // transaction, so a taken username fails the signup outright rather
          // than leaving an account with no profile behind it.
          data: {
            username: normaliseUsername(input.username),
            display_name: input.displayName?.trim() || "",
            phone,
          },
          emailRedirectTo: `${window.location.origin}/login?confirmed=1`,
        },
      });

      if (error) return { ok: false, message: explain(error, lang) };
      return { ok: true };
    },
    [],
  );

  const requestPasswordReset = useCallback(
    async (email: string, lang: Lang): Promise<AuthResult> => {
      const supabase = getSupabase();
      if (!supabase) return { ok: false, message: T[lang].generic };

      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${window.location.origin}/reset-password` },
      );

      // Only a transport failure is worth reporting. Anything else -- including
      // "no such user" -- is reported as success by the caller, because saying
      // otherwise turns this form into a test for whether an address has an
      // account. Supabase already declines to say; we must not undo that.
      if (error && (error.message || "").toLowerCase().includes("fetch")) {
        return { ok: false, message: T[lang].offline };
      }
      return { ok: true };
    },
    [],
  );

  const updatePassword = useCallback(
    async (password: string, lang: Lang): Promise<AuthResult> => {
      const supabase = getSupabase();
      if (!supabase) return { ok: false, message: T[lang].generic };

      const { error } = await supabase.auth.updateUser({ password });
      if (error) return { ok: false, message: explain(error, lang) };

      setRecovering(false);
      // A password change should not leave whoever prompted it still signed in
      // somewhere else. This session stays; every other one is revoked.
      await supabase.auth.signOut({ scope: "others" }).catch(() => {});
      return { ok: true };
    },
    [],
  );

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    // Local prefs and progress are deliberately left alone: signing out should
    // not wipe the palette and place off a device that worked fine before.
    await supabase.auth.signOut().catch(() => {});
  }, []);

  return {
    status,
    user,
    recovering,
    lockedForSeconds,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    signOut,
  };
}
