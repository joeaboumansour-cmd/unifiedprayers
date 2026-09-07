"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import AuthShell, {
  Field,
  Notice,
  PasswordInput,
  TextInput,
  linkButton,
  primaryButton,
} from "@/components/auth/AuthShell";
import { markRecovery, recoveryIsLive } from "@/lib/authRecovery";
import { type Lang, paletteInfo } from "@/lib/content";
import { readPrefs } from "@/lib/state";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/useAuth";
import {
  PASSWORD_MIN,
  checkPassword,
  checkPhone,
  checkUsername,
  normaliseUsername,
  passwordStrength,
} from "@/lib/username";

type Mode = "signin" | "signup" | "forgot";

const COPY = {
  ar: {
    signinTitle: "تسجيل الدخول",
    signinSub: "لتنتقل إعداداتك وموضعك بين أجهزتك.",
    signupTitle: "إنشاء حساب",
    signupSub: "حساب واحد يكفي. التطبيق يعمل بدونه أيضًا.",
    email: "البريد الإلكتروني",
    password: "كلمة السر",
    newPassword: "كلمة السر",
    username: "اسم المستخدم",
    displayName: "الاسم الظاهر",
    phone: "رقم الهاتف",
    usernameHint: "أحرف إنجليزية وأرقام وشرطة سفلية، من ٣ إلى ٢٠ حرفًا.",
    displayNameHint: "الاسم الذي يراه غيرك. يمكن تغييره لاحقًا.",
    phoneHint: "للتذكير بالتساعيات لاحقًا. لن يظهر لأحد.",
    passwordHint: `${PASSWORD_MIN} أحرف على الأقل. الأطول أفضل من الأعقد.`,
    signIn: "دخول",
    signUp: "إنشاء الحساب",
    forgotTitle: "إعادة تعيين كلمة السر",
    forgotSub: "أدخل بريدك، ونرسل لك رمزًا لاختيار كلمة سر جديدة.",
    forgotCta: "إرسال الرمز",
    forgotLink: "نسيت كلمة السر؟",
    backToSignIn: "العودة إلى الدخول",
    noAccount: "ليس لديك حساب؟ أنشئ واحدًا",
    haveAccount: "لديك حساب؟ سجّل الدخول",
    checking: "جارٍ التحقق…",
    available: "متاح",
    taken: "محجوز",
    working: "لحظة…",
    checkMailTitle: "تفقّد بريدك",
    confirmFirstTitle: "أكّد بريدك أولًا",
    confirmSent: (email: string) =>
      `أنشأنا الحساب وأرسلنا رمزًا إلى ${email}. أدخله هنا لتفعيل الحساب.`,
    resetSent: (email: string) =>
      `إن كان لـ ${email} حساب عندنا، فرمز إعادة التعيين في طريقه إليه الآن.`,
    confirmPending: (email: string) =>
      `${email} لم يُؤكَّد بعد. أدخل الرمز المرسل إليه، أو اطلب رمزًا جديدًا.`,
    spamHint: "لم تصل خلال دقيقة؟ تفقّد مجلد الرسائل غير المرغوب فيها.",
    codeLabel: "رمز التأكيد",
    codeLabelReset: "رمز إعادة التعيين",
    verifyCtaReset: "متابعة",
    orLinkReset:
      "أو افتح الرابط في الرسالة نفسها — لكنه يفتح في متصفّح بريدك، وقد لا تنتقل الجلسة إلى التطبيق.",
    codeHint: "ستة أرقام، في الرسالة نفسها. صالح لساعة.",
    verifyCta: "تأكيد وتسجيل الدخول",
    codeTooShort: "الرمز ستة أرقام.",
    orLink: "أو افتح الرابط في الرسالة نفسها — لكنه يفتح في متصفّح بريدك، فقد يلزمك تسجيل الدخول هنا بعده.",
    resend: "إعادة الإرسال",
    resendWait: (s: number) => `يمكن إعادة الإرسال بعد ${s} ثانية`,
    resendDone: "أُرسلت رسالة أخرى.",
    badEmail: "أدخل بريدًا إلكترونيًا صحيحًا.",
    missing: "أدخل البريد وكلمة السر.",
    lockedFor: (s: number) => `محاولات كثيرة. حاول بعد ${s} ثانية.`,
    optional: "اختياري",
  },
  en: {
    signinTitle: "Sign in",
    signinSub: "So your settings and place follow you between devices.",
    signupTitle: "Create an account",
    signupSub: "One account is enough. The app works without one too.",
    email: "Email address",
    password: "Password",
    newPassword: "Password",
    username: "Username",
    displayName: "Display name",
    phone: "Phone number",
    usernameHint: "Letters, numbers and underscores, 3 to 20 characters.",
    displayNameHint: "The name other people see. You can change it later.",
    phoneHint: "For novena reminders later. Never shown to anyone.",
    passwordHint: `At least ${PASSWORD_MIN} characters. Longer beats more complicated.`,
    signIn: "Sign in",
    signUp: "Create account",
    forgotTitle: "Reset your password",
    forgotSub: "Give us your email and we will send a code to choose a new one.",
    forgotCta: "Send reset code",
    forgotLink: "Forgotten your password?",
    backToSignIn: "Back to sign in",
    noAccount: "No account? Create one",
    haveAccount: "Already have an account? Sign in",
    checking: "Checking…",
    available: "Available",
    taken: "Taken",
    working: "One moment…",
    checkMailTitle: "Check your email",
    confirmFirstTitle: "Confirm your email first",
    confirmSent: (email: string) =>
      `Your account is created. Enter the code we sent to ${email} to activate it.`,
    resetSent: (email: string) =>
      `If ${email} has an account with us, a reset code is on its way to it now.`,
    confirmPending: (email: string) =>
      `${email} has not been confirmed yet. Enter the code from that email, or ask for a new one.`,
    spamHint: "Not there within a minute? Have a look in your spam folder.",
    codeLabel: "Confirmation code",
    codeLabelReset: "Reset code",
    verifyCtaReset: "Continue",
    orLinkReset:
      "Or open the link in the same email — but that opens in your mail app's browser, and the session may not carry into the app.",
    codeHint: "Six digits, in the email itself. Good for an hour.",
    verifyCta: "Confirm and sign in",
    codeTooShort: "The code is six digits.",
    orLink: "Or open the link in the same email — but that opens in your mail app's browser, so you may have to sign in here afterwards.",
    resend: "Send it again",
    resendWait: (s: number) => `You can send again in ${s}s`,
    resendDone: "Another email is on its way.",
    badEmail: "Enter a valid email address.",
    missing: "Enter your email and password.",
    lockedFor: (s: number) => `Too many attempts. Try again in ${s}s.`,
    optional: "Optional",
  },
} as const;

type Availability = "idle" | "checking" | "free" | "taken";

export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();

  const [lang, setLang] = useState<Lang>("ar");
  const [mode, setMode] = useState<Mode>("signin");
  const [ready, setReady] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");

  const [availability, setAvailability] = useState<Availability>("idle");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  /* Set once an email has gone out. It replaces the form entirely: leaving the
     fields up invites a second submit that only rate-limits the first. */
  const [sent, setSent] = useState<{
    /** "confirm" is a link just sent; "pending" is one sent some time ago. */
    kind: "confirm" | "reset" | "pending";
    email: string;
  } | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [code, setCode] = useState("");

  const t = COPY[lang];

  /* Match the app's language and palette, so this does not look like a
     different product than the one it is attached to. */
  useEffect(() => {
    const prefs = readPrefs();
    if (prefs) {
      setLang(prefs.lang);
      const { theme } = paletteInfo(prefs.palette);
      document.documentElement.dataset.palette = prefs.palette;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", theme);
    }
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("mode");
    if (wanted === "signup" || wanted === "forgot") setMode(wanted);
    setReady(true);
  }, []);

  /* Already signed in: there is nothing to do on this page.

     Except mid-reset. Verifying a recovery code signs the person in, which
     trips this effect, and it would race the handoff to /reset-password and
     win -- landing somebody who asked to change their password on the home
     screen instead, with no way back to the form and a spent code. The marker
     is set immediately before that handoff, so it is the one thing here that
     can tell the two apart. */
  useEffect(() => {
    if (auth.status === "signed-in" && !recoveryIsLive()) router.replace("/");
  }, [auth.status, router]);

  /* Username availability, debounced. Only asked once the name is well formed,
     so a half-typed name never becomes a request. */
  const usernameCheck = checkUsername(username, lang);
  const usernameValid = usernameCheck.ok;

  useEffect(() => {
    if (mode !== "signup" || !usernameValid) {
      setAvailability("idle");
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;

    setAvailability("checking");
    let live = true;
    const id = window.setTimeout(async () => {
      const { data, error: rpcError } = await supabase.rpc("username_available", {
        u: normaliseUsername(username),
      });
      if (!live) return;
      // Offline, or the function is missing: say nothing rather than guess.
      // The unique index still decides at signup.
      if (rpcError) return setAvailability("idle");
      setAvailability(data ? "free" : "taken");
    }, 450);

    return () => {
      live = false;
      window.clearTimeout(id);
    };
  }, [username, usernameValid, mode, lang]);

  /* A visible cooldown on the resend button. Supabase enforces its own limit
     server-side; this is so the second tap is a wait rather than an error. */
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = window.setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [resendIn]);

  const resend = async () => {
    if (!sent || resendIn > 0 || pending) return;
    setError(null);
    setDone(null);
    setPending(true);
    const res =
      sent.kind === "reset"
        ? await auth.requestPasswordReset(sent.email, lang)
        : await auth.resendConfirmation(sent.email, lang);
    setPending(false);
    if (!res.ok) return setError(res.message);
    setDone(t.resendDone);
    setResendIn(60);
  };

  /* Confirming by code rather than by link. The whole point is that the
     session lands in this browser -- the one the app is actually used in --
     instead of whichever browser the mail app happens to own. */
  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sent || pending) return;
    setError(null);
    setDone(null);

    const digits = code.replace(/[^0-9]/g, "");
    if (digits.length !== 6) return setError(t.codeTooShort);

    setPending(true);
    const res =
      sent.kind === "reset"
        ? await auth.verifyResetCode(sent.email, digits, lang)
        : await auth.confirmWithCode(sent.email, digits, lang);
    setPending(false);
    if (!res.ok) return setError(res.message);

    if (sent.kind === "reset") {
      // The code proved the mailbox, and verifyOtp opened a session on the
      // strength of it. /reset-password will not take a password from a
      // session that cannot show this.
      markRecovery();
      router.replace("/reset-password");
      return;
    }
    router.replace("/");
  };

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    setError(null);
    setDone(null);
    setSent(null);
    setPassword("");
    setCode("");
  }, []);

  /* ------------------------------- submit ------------------------------- */

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || auth.lockedForSeconds > 0) return;
    setError(null);
    setDone(null);

    if (mode === "forgot") {
      if (!email.includes("@")) return setError(t.badEmail);
      setPending(true);
      const res = await auth.requestPasswordReset(email, lang);
      setPending(false);
      if (!res.ok) return setError(res.message);
      // Deliberately the same answer whether or not that address is registered.
      setSent({ kind: "reset", email: email.trim().toLowerCase() });
      setResendIn(60);
      return;
    }

    if (mode === "signin") {
      // The form is noValidate, so nothing else stops an empty submit, and an
      // empty submit only spends one of the five attempts before the lockout.
      if (!email.trim() || !password) return setError(t.missing);
      setPending(true);
      const res = await auth.signIn(email, password, lang);
      setPending(false);
      if (!res.ok) {
        // The password was right and the address was not confirmed. Put them
        // on the panel that can do something about it, with no cooldown: no
        // mail went out just now, so there is nothing to wait for.
        if (res.reason === "unconfirmed") {
          setSent({ kind: "pending", email: email.trim().toLowerCase() });
          setResendIn(0);
          return;
        }
        return setError(res.message);
      }
      return router.replace("/");
    }

    // signup
    const u = checkUsername(username, lang);
    if (!u.ok) return setError(u.reason);
    if (availability === "taken") return setError(t.taken);
    const pw = checkPassword(password, lang);
    if (!pw.ok) return setError(pw.reason);
    const ph = checkPhone(phone, lang);
    if (!ph.ok) return setError(ph.reason);

    setPending(true);
    const res = await auth.signUp(
      { email, password, username, displayName, phone },
      lang,
    );
    setPending(false);
    if (!res.ok) return setError(res.message);
    // No session means confirmation is on and the link is in the post. With it
    // off, signing up signs you in and the redirect effect above takes over.
    if (res.pendingConfirmation) {
      setSent({ kind: "confirm", email: email.trim().toLowerCase() });
      setResendIn(60);
      return;
    }
    router.replace("/");
  };

  if (!ready || auth.status === "loading") {
    return <AuthShell lang={lang} title="" />;
  }

  /* An email has gone out. Nothing on this page can help until it is opened,
     so the form goes away and only the two useful actions remain: send it
     again, or go back. */
  if (sent) {
    return (
      <AuthShell
        lang={lang}
        title={sent.kind === "pending" ? t.confirmFirstTitle : t.checkMailTitle}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {error && <Notice tone="error">{error}</Notice>}
          <Notice tone="ok">
            {sent.kind === "confirm"
              ? t.confirmSent(sent.email)
              : sent.kind === "pending"
                ? t.confirmPending(sent.email)
                : t.resetSent(sent.email)}
          </Notice>
          {done && <Notice tone="info">{done}</Notice>}

          {(
            <form
              onSubmit={submitCode}
              noValidate
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              {/* Named for the password manager, which otherwise offers to save
                  the code against the account as if it were a password. */}
              <input
                type="email"
                value={sent.email}
                autoComplete="username"
                readOnly
                hidden
              />
              <Field
                label={sent.kind === "reset" ? t.codeLabelReset : t.codeLabel}
                hint={t.codeHint}
              >
                {(id, describedBy) => (
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    // one-time-code is what lets iOS and Android offer the
                    // digits straight from the notification, which is the
                    // entire reason for preferring a code to a link.
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={7}
                    autoFocus
                    required
                    placeholder="000000"
                    style={{
                      textAlign: "center",
                      fontSize: 24,
                      letterSpacing: ".3em",
                      // The placeholder is centred; the letter-spacing would
                      // otherwise push the digits off to one side.
                      paddingInlineStart: 14 + 7,
                    }}
                  />
                )}
              </Field>
              <button
                type="submit"
                disabled={pending}
                style={primaryButton(pending)}
              >
                {pending
                  ? t.working
                  : sent.kind === "reset"
                    ? t.verifyCtaReset
                    : t.verifyCta}
              </button>
            </form>
          )}

          <div
            style={{
              fontSize: 11.5,
              lineHeight: 1.6,
              color: "var(--dim-3)",
              textAlign: "center",
            }}
          >
            {sent.kind === "reset"
              ? `${t.spamHint} ${t.orLinkReset}`
              : `${t.spamHint} ${t.orLink}`}
          </div>
          <button
            type="button"
            onClick={resend}
            disabled={pending || resendIn > 0}
            style={primaryButton(pending || resendIn > 0)}
          >
            {pending
              ? t.working
              : resendIn > 0
                ? t.resendWait(resendIn)
                : t.resend}
          </button>
          <div style={{ textAlign: "center" }}>
            <button
              type="button"
              style={linkButton}
              onClick={() => switchMode("signin")}
            >
              {t.backToSignIn}
            </button>
          </div>
        </div>
      </AuthShell>
    );
  }

  const locked = auth.lockedForSeconds > 0;
  const title =
    mode === "signin"
      ? t.signinTitle
      : mode === "signup"
        ? t.signupTitle
        : t.forgotTitle;
  const subtitle =
    mode === "signin"
      ? t.signinSub
      : mode === "signup"
        ? t.signupSub
        : t.forgotSub;
  const strength = passwordStrength(password);

  return (
    <AuthShell lang={lang} title={title} subtitle={subtitle}>
      <form
        onSubmit={onSubmit}
        noValidate
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        {done && <Notice tone="ok">{done}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        {locked && <Notice tone="error">{t.lockedFor(auth.lockedForSeconds)}</Notice>}

        {/* Hidden from view but present for password managers, which key a
            saved credential on the username field next to the password. */}
        {mode === "signup" && (
          <Field label={t.username} hint={t.usernameHint}
            error={username && !usernameValid ? (usernameCheck as { reason: string }).reason : null}>
            {(id, describedBy) => (
              <>
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={20}
                  required
                  invalid={Boolean(username) && !usernameValid}
                  placeholder="joseph_k"
                />
                {usernameValid && availability !== "idle" && (
                  <div
                    style={{
                      fontSize: 11.5,
                      marginTop: 2,
                      color:
                        availability === "taken"
                          ? "#f2a2b0"
                          : availability === "free"
                            ? "var(--accent)"
                            : "var(--dim-3)",
                    }}
                  >
                    {availability === "checking"
                      ? t.checking
                      : availability === "free"
                        ? t.available
                        : t.taken}
                  </div>
                )}
              </>
            )}
          </Field>
        )}

        <Field label={t.email}>
          {(id, describedBy) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete={mode === "signin" ? "username" : "email"}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              required
              placeholder="you@example.com"
            />
          )}
        </Field>

        {mode !== "forgot" && (
        <Field
          label={t.password}
          hint={mode === "signup" ? t.passwordHint : undefined}
        >
            {(id, describedBy) => (
              <>
                <PasswordInput
                  id={id}
                  describedBy={describedBy}
                  value={password}
                  onChange={setPassword}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  lang={lang}
                />
                {mode === "signup" && password.length > 0 && (
                  <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        style={{
                          height: 3,
                          flex: 1,
                          borderRadius: 999,
                          background:
                            i < strength
                              ? "rgb(var(--accent-rgb) / .8)"
                              : "rgba(255,255,255,.09)",
                        }}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
        </Field>
        )}

        {mode === "signup" && (
          <>
            <Field
              label={t.displayName}
              badge={t.optional}
              hint={t.displayNameHint}
            >
              {(id, describedBy) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                  maxLength={40}
                  dir="auto"
                />
              )}
            </Field>

            <Field label={t.phone} badge={t.optional} hint={t.phoneHint}>
              {(id, describedBy) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="+961 3 123 456"
                />
              )}
            </Field>
          </>
        )}

        <button
          type="submit"
          disabled={pending || locked}
          style={primaryButton(pending || locked)}
        >
          {pending
            ? t.working
            : mode === "signin"
              ? t.signIn
              : mode === "signup"
                ? t.signUp
                : t.forgotCta}
        </button>
      </form>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "center",
          marginTop: 18,
          paddingTop: 16,
          borderTop: "1px solid rgba(255,255,255,.06)",
        }}
      >
        {mode === "signin" && (
          <>
            <button type="button" style={linkButton} onClick={() => switchMode("signup")}>
              {t.noAccount}
            </button>
            <button type="button" style={linkButton} onClick={() => switchMode("forgot")}>
              {t.forgotLink}
            </button>
          </>
        )}
        {mode !== "signin" && (
          <button type="button" style={linkButton} onClick={() => switchMode("signin")}>
            {mode === "signup" ? t.haveAccount : t.backToSignIn}
          </button>
        )}
      </div>
    </AuthShell>
  );
}
