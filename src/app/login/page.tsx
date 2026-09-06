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
    forgotTitle: "استعادة كلمة السر",
    forgotSub: "أدخل بريدك وسنرسل لك رابطًا لتغيير كلمة السر.",
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
    sendReset: "أرسل الرابط",
    forgot: "نسيت كلمة السر؟",
    noAccount: "ليس لديك حساب؟ أنشئ واحدًا",
    haveAccount: "لديك حساب؟ سجّل الدخول",
    checking: "جارٍ التحقق…",
    available: "متاح",
    taken: "محجوز",
    working: "لحظة…",
    confirmSent:
      "أرسلنا رسالة تأكيد إلى بريدك. افتح الرابط فيها لتفعيل الحساب.",
    resetSent:
      "إن كان هناك حساب بهذا البريد فسيصلك رابط لتغيير كلمة السر. تفقّد بريدك.",
    confirmed: "تم تأكيد بريدك. يمكنك تسجيل الدخول الآن.",
    lockedFor: (s: number) => `محاولات كثيرة. حاول بعد ${s} ثانية.`,
    optional: "اختياري",
  },
  en: {
    signinTitle: "Sign in",
    signinSub: "So your settings and place follow you between devices.",
    signupTitle: "Create an account",
    signupSub: "One account is enough. The app works without one too.",
    forgotTitle: "Reset your password",
    forgotSub: "Enter your email and we will send you a link to set a new one.",
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
    sendReset: "Send the link",
    forgot: "Forgot your password?",
    noAccount: "No account? Create one",
    haveAccount: "Already have an account? Sign in",
    checking: "Checking…",
    available: "Available",
    taken: "Taken",
    working: "One moment…",
    confirmSent:
      "We sent a confirmation message to your email. Open the link in it to activate your account.",
    resetSent:
      "If an account exists for that address, a link to set a new password is on its way. Check your email.",
    confirmed: "Your email is confirmed. You can sign in now.",
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
  const [confirmed, setConfirmed] = useState(false);

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
    const m = params.get("mode");
    if (m === "signup" || m === "forgot") setMode(m);
    if (params.get("confirmed") === "1") setConfirmed(true);
    setReady(true);
  }, []);

  /* Already signed in: there is nothing to do on this page. */
  useEffect(() => {
    if (auth.status === "signed-in") router.replace("/");
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

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    setError(null);
    setDone(null);
    setConfirmed(false);
    setPassword("");
  }, []);

  /* ------------------------------- submit ------------------------------- */

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || auth.lockedForSeconds > 0) return;
    setError(null);
    setDone(null);

    if (mode === "forgot") {
      setPending(true);
      const res = await auth.requestPasswordReset(email, lang);
      setPending(false);
      // Success either way: whether that address has an account is not this
      // form's to reveal.
      if (!res.ok) return setError(res.message);
      return setDone(t.resetSent);
    }

    if (mode === "signin") {
      setPending(true);
      const res = await auth.signIn(email, password, lang);
      setPending(false);
      if (!res.ok) return setError(res.message);
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
    setDone(t.confirmSent);
  };

  if (!ready || auth.status === "loading") {
    return <AuthShell lang={lang} title="" />;
  }

  const locked = auth.lockedForSeconds > 0;
  const title =
    mode === "signin" ? t.signinTitle : mode === "signup" ? t.signupTitle : t.forgotTitle;
  const subtitle =
    mode === "signin" ? t.signinSub : mode === "signup" ? t.signupSub : t.forgotSub;
  const strength = passwordStrength(password);

  return (
    <AuthShell lang={lang} title={title} subtitle={subtitle}>
      <form
        onSubmit={onSubmit}
        noValidate
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        {confirmed && <Notice tone="ok">{t.confirmed}</Notice>}
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
              autoComplete={mode === "signup" ? "email" : "username"}
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
                : t.sendReset}
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
            <button type="button" style={linkButton} onClick={() => switchMode("forgot")}>
              {t.forgot}
            </button>
            <button type="button" style={linkButton} onClick={() => switchMode("signup")}>
              {t.noAccount}
            </button>
          </>
        )}
        {mode !== "signin" && (
          <button type="button" style={linkButton} onClick={() => switchMode("signin")}>
            {t.haveAccount}
          </button>
        )}
      </div>
    </AuthShell>
  );
}
