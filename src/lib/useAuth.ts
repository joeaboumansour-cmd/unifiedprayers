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
export type AuthResult =
  | {
      ok: true;
      /**
       * Set by signUp when Supabase withheld the session: the account exists
       * but its address is unconfirmed and a confirmation email is on its way.
       * The caller has to say so, or the signup looks like it did nothing.
       */
      pendingConfirmation?: boolean;
    }
  | {
      ok: false;
      message: string;
      /**
       * The account exists and the password was right, but the address has
       * never been confirmed. The caller should offer to send the link again
       * rather than leaving the person to guess at a password that was fine.
       */
      reason?: "unconfirmed";
    };

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
  /** Seconds the sign-in form should stay disabled after repeated failures. */
  lockedForSeconds: number;
  signIn: (email: string, password: string, lang: Lang) => Promise<AuthResult>;
  signUp: (input: SignUpInput, lang: Lang) => Promise<AuthResult>;
  /**
   * Changes the password of the signed-in account. The current password is
   * required even though reset links now exist: an open session proves nothing
   * about who is holding the device, so the old password is the proof.
   */
  changePassword: (
    current: string,
    next: string,
    lang: Lang,
  ) => Promise<AuthResult>;
  /** Sends a reset link. Reports success whether or not the address has an
      account, so this form cannot be used to discover who is registered. */
  requestPasswordReset: (email: string, lang: Lang) => Promise<AuthResult>;
  /** Sends the confirmation email again, for one that never arrived. */
  resendConfirmation: (email: string, lang: Lang) => Promise<AuthResult>;
  /**
   * Confirms an address with the code from the email, rather than the link.
   *
   * This is the path that works on a phone. A link is opened by whichever
   * browser the mail app owns, and the session it creates lives in that
   * browser's storage, not in the installed app -- so confirming by link ends
   * with somebody still signed out on their home screen. A code is typed into
   * the app itself, so the session is created where it is wanted.
   */
  confirmWithCode: (
    email: string,
    code: string,
    lang: Lang,
  ) => Promise<AuthResult>;
  /**
   * Opens a recovery session with the code from the reset email, rather than
   * the link, for the same reason confirmWithCode exists: the session has to
   * be created in the browser the app is used in, and a link is opened by
   * whichever browser the mail app owns. On success the caller may show
   * /reset-password.
   */
  verifyResetCode: (
    email: string,
    code: string,
    lang: Lang,
  ) => Promise<AuthResult>;
  /**
   * Sets the password on the session a recovery link just opened. Asks for no
   * current password because the link was the proof. Only /reset-password
   * calls this, and only once lib/authRecovery confirms this tab redeemed it.
   */
  setNewPassword: (next: string, lang: Lang) => Promise<AuthResult>;
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
    notConfirmed: "لم يُؤكَّد هذا البريد بعد. افتح رابط التأكيد المرسل إليه.",
    wrongCurrent: "كلمة السر الحالية غير صحيحة.",
    samePassword: "كلمة السر الجديدة هي نفسها الحالية.",
    usernameTaken: "اسم المستخدم محجوز، جرّب غيره.",
    phoneTaken: "رقم الهاتف مستخدم في حساب آخر.",
    locked: "محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.",
    offline: "تعذّر الاتصال. تحقق من الشبكة وحاول مجددًا.",
    weakPassword: "كلمة السر ضعيفة أو مكشوفة في تسريب معروف. اختر واحدة أخرى.",
    badCode: "الرمز غير صحيح أو انتهت صلاحيته. تحقّق منه أو اطلب رمزًا جديدًا.",
    generic: "تعذّر إتمام الطلب. حاول مجددًا.",
  },
  en: {
    badCredentials: "That email or password is incorrect.",
    notConfirmed: "That email has not been confirmed yet. Open the link we sent to it.",
    wrongCurrent: "That is not your current password.",
    samePassword: "The new password is the same as the current one.",
    usernameTaken: "That username is taken, try another.",
    phoneTaken: "That phone number is already on another account.",
    locked: "Too many attempts. Wait a moment and try again.",
    offline: "Could not reach the server. Check your connection and try again.",
    weakPassword: "That password is too weak, or appears in a known breach. Choose another.",
    badCode: "That code is wrong or has expired. Check it, or ask for a new one.",
    generic: "Something went wrong. Please try again.",
  },
} as const;

/** Maps a Supabase error onto copy, without ever echoing the raw message. */
function explain(error: { message?: string; code?: string } | null, lang: Lang): string {
  const t = T[lang];
  const raw = (error?.message || "").toLowerCase();
  const code = error?.code || "";

  if (raw.includes("failed to fetch") || raw.includes("network")) return t.offline;
  if (code === "email_not_confirmed" || raw.includes("not confirmed")) {
    return t.notConfirmed;
  }
  if (code === "invalid_credentials" || raw.includes("invalid login")) return t.badCredentials;
  if (code === "same_password" || raw.includes("should be different")) {
    return t.samePassword;
  }
  if (code === "weak_password" || raw.includes("pwned") || raw.includes("weak")) {
    return t.weakPassword;
  }
  if (
    code === "otp_expired" ||
    raw.includes("token has expired") ||
    raw.includes("invalid token") ||
    raw.includes("otp")
  ) {
    return t.badCode;
  }
  if (code === "over_request_rate_limit" || raw.includes("rate limit")) return t.locked;
  // The signup trigger raises these when a username or phone is already held.
  // Matching the bare words is not enough: an empty sign-in form comes back as
  // "missing email or phone", which is not a phone that belongs to somebody
  // else. So a duplication has to be stated as well as a field named.
  const duplicate =
    raw.includes("duplicate") || raw.includes("already") || raw.includes("unique");
  if (raw.includes("profiles_username_key") || (duplicate && raw.includes("username"))) {
    return t.usernameTaken;
  }
  if (raw.includes("user_private_phone_key") || (duplicate && raw.includes("phone"))) {
    return t.phoneTaken;
  }
  return t.generic;
}

/**
 * Where every link in an auth email lands. Built from the running origin so a
 * link requested on localhost comes back to localhost, and the templates never
 * have to hard-code a domain.
 */
function emailLanding(): string {
  return `${window.location.origin}/auth/confirm`;
}

export function useAuth(): Auth {
  const [status, setStatus] = useState<AuthStatus>(
    isSupabaseConfigured ? "loading" : "disabled",
  );
  const [user, setUser] = useState<User | null>(null);
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

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
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
        const unconfirmed =
          error.code === "email_not_confirmed" ||
          error.message.toLowerCase().includes("not confirmed");
        // An unconfirmed account is not a failed guess, and counting it toward
        // the lockout would punish the one person who did nothing wrong.
        if (!unconfirmed) noteFailure();
        return {
          ok: false,
          message: explain(error, lang),
          ...(unconfirmed ? { reason: "unconfirmed" as const } : {}),
        };
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

      // Profile rows are built when the address is confirmed, not here, so a
      // taken username no longer fails the signup transaction the way it did
      // when the trigger ran on insert. Without this check the form would
      // accept a name somebody already holds and quietly hand back a suffixed
      // one at confirmation time. The form's own debounced check runs while
      // typing; this is the one that runs against the value being submitted.
      //
      // An RPC failure is not a refusal: offline, or an older database without
      // the function, must not block a signup that is probably fine.
      const { data: free, error: checkError } = await supabase.rpc(
        "username_available",
        { u: normaliseUsername(input.username) },
      );
      if (!checkError && free === false) {
        return { ok: false, message: T[lang].usernameTaken };
      }

      const { data, error } = await supabase.auth.signUp({
        email: input.email.trim().toLowerCase(),
        password: input.password,
        options: {
          emailRedirectTo: emailLanding(),
          // Read by handle_new_user() to build the profile row in the same
          // transaction, so a taken username fails the signup outright rather
          // than leaving an account with no profile behind it.
          data: {
            username: normaliseUsername(input.username),
            display_name: input.displayName?.trim() || "",
            phone,
          },
        },
      });

      if (error) return { ok: false, message: explain(error, lang) };
      return { ok: true, pendingConfirmation: !data.session };
    },
    [],
  );

  const changePassword = useCallback(
    async (current: string, next: string, lang: Lang): Promise<AuthResult> => {
      const supabase = getSupabase();
      if (!supabase) return { ok: false, message: T[lang].generic };

      const { data } = await supabase.auth.getSession();
      const email = data.session?.user.email;
      if (!email) return { ok: false, message: T[lang].generic };

      // Supabase lets a live session set a new password without proving the
      // old one. That is fine when a reset link did the proving; here nothing
      // did, so an unattended phone would be enough to take the account over.
      // Signing in again with the current password is that proof.
      const check = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (check.error) {
        return { ok: false, message: T[lang].wrongCurrent };
      }

      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) return { ok: false, message: explain(error, lang) };

      // A password change should not leave whoever prompted it still signed in
      // somewhere else. This session stays; every other one is revoked.
      await supabase.auth.signOut({ scope: "others" }).catch(() => {});
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
        { redirectTo: emailLanding() },
      );

      // Only the failures that are about this request rather than about the
      // address are worth showing. Supabase already declines to say whether an
      // account exists, and repeating that silence here keeps it that way.
      if (error) return { ok: false, message: explain(error, lang) };
      return { ok: true };
    },
    [],
  );

  const resendConfirmation = useCallback(
    async (email: string, lang: Lang): Promise<AuthResult> => {
      const supabase = getSupabase();
      if (!supabase) return { ok: false, message: T[lang].generic };

      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: emailLanding() },
      });

      if (error) return { ok: false, message: explain(error, lang) };
      return { ok: true };
    },
    [],
  );

  const confirmWithCode = useCallback(
    async (email: string, code: string, lang: Lang): Promise<AuthResult> => {
      const supabase = getSupabase();
      if (!supabase) return { ok: false, message: T[lang].generic };

      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        // Whitespace because people paste, and a code read off a lock screen
        // often arrives with a space in the middle.
        token: code.replace(/s+/g, ""),
        type: "signup",
      });

      if (error) return { ok: false, message: explain(error, lang) };
      // verifyOtp signs them in as a side effect, and onAuthStateChange will
      // have taken care of the session before this returns.
      return { ok: true };
    },
    [],
  );

  const verifyResetCode = useCallback(
    async (email: string, code: string, lang: Lang): Promise<AuthResult> => {
      const supabase = getSupabase();
      if (!supabase) return { ok: false, message: T[lang].generic };

      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.replace(/s+/g, ""),
        type: "recovery",
      });

      if (error) return { ok: false, message: explain(error, lang) };
      return { ok: true };
    },
    [],
  );

  const setNewPassword = useCallback(
    async (next: string, lang: Lang): Promise<AuthResult> => {
      const supabase = getSupabase();
      if (!supabase) return { ok: false, message: T[lang].generic };

      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) return { ok: false, message: explain(error, lang) };

      // Whoever forced the reset may be sitting in another session right now.
      // This one stays; every other one goes.
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
    lockedForSeconds,
    signIn,
    signUp,
    changePassword,
    requestPasswordReset,
    resendConfirmation,
    confirmWithCode,
    verifyResetCode,
    setNewPassword,
    signOut,
  };
}
