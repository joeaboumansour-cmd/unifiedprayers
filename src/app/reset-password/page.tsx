"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AuthShell, {
  Field,
  Notice,
  PasswordInput,
  primaryButton,
} from "@/components/auth/AuthShell";
import { clearRecovery, recoveryIsLive } from "@/lib/authRecovery";
import { useAuth } from "@/lib/useAuth";
import { useAuthChrome } from "@/lib/useAuthChrome";
import { PASSWORD_MIN, checkPassword, passwordStrength } from "@/lib/username";

/* Reached only from /auth/confirm, after a recovery token has been redeemed.
   Typing the address in directly lands on the "ask for a link" state, on
   purpose: see the note in lib/authRecovery. */

const COPY = {
  ar: {
    title: "كلمة سر جديدة",
    sub: "اخترها الآن، وستُسجَّل الدخول مباشرة.",
    password: "كلمة السر الجديدة",
    passwordHint: `${PASSWORD_MIN} أحرف على الأقل. الأطول أفضل من الأعقد.`,
    save: "حفظ كلمة السر",
    working: "لحظة…",
    doneTitle: "تم",
    done: "غُيّرت كلمة السر، وأُنهيت الجلسات الأخرى. نأخذك إلى الصلاة…",
    deniedTitle: "افتح الرابط من بريدك",
    denied:
      "هذه الصفحة تُفتح من رابط إعادة التعيين في بريدك فقط. اطلب رابطًا جديدًا إن لزم.",
    newLink: "طلب رابط جديد",
    signedInHint:
      "أنت مسجّل الدخول أصلًا؟ غيّر كلمة السر من الإعدادات، فذلك يطلب كلمة السر الحالية.",
  },
  en: {
    title: "Choose a new password",
    sub: "Pick one now and you will be signed in straight away.",
    password: "New password",
    passwordHint: `At least ${PASSWORD_MIN} characters. Longer beats more complicated.`,
    save: "Save password",
    working: "One moment…",
    doneTitle: "Done",
    done: "Your password is changed and every other session was signed out. Taking you back…",
    deniedTitle: "Open the link from your email",
    denied:
      "This page opens from the reset link in your email. Ask for a new link if you need one.",
    newLink: "Request a new link",
    signedInHint:
      "Already signed in? Change your password from Settings instead — that asks for your current one.",
  },
} as const;

type Phase = "checking" | "form" | "denied" | "done";

export default function ResetPasswordPage() {
  const router = useRouter();
  const auth = useAuth();
  const { lang, ready } = useAuthChrome();

  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = COPY[lang];

  /* Two things have to be true: a session exists (the token was redeemed) and
     this tab is the one that redeemed it. Waiting for auth.status to settle
     first, or a signed-in person would be bounced during the loading frame. */
  useEffect(() => {
    if (phase !== "checking") return;
    if (auth.status === "loading") return;
    if (auth.status === "signed-in" && recoveryIsLive()) {
      setPhase("form");
      return;
    }
    setPhase("denied");
  }, [auth.status, phase]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError(null);

    const pw = checkPassword(password, lang);
    if (!pw.ok) return setError(pw.reason);

    setPending(true);
    const res = await auth.setNewPassword(password, lang);
    setPending(false);
    if (!res.ok) return setError(res.message);

    // Spent, whatever happens next: the link redeemed it and the password it
    // guarded has already changed.
    clearRecovery();
    setPhase("done");
    window.setTimeout(() => router.replace("/"), 1600);
  };

  if (!ready || phase === "checking") return <AuthShell lang={lang} title="" />;

  if (phase === "denied") {
    return (
      <AuthShell lang={lang} title={t.deniedTitle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Notice tone="info">{t.denied}</Notice>
          <Link
            href="/login?mode=forgot"
            style={{ ...primaryButton(false), display: "block", textAlign: "center" }}
          >
            {t.newLink}
          </Link>
          <div
            style={{
              fontSize: 11.5,
              lineHeight: 1.6,
              color: "var(--dim-3)",
              textAlign: "center",
            }}
          >
            {t.signedInHint}
          </div>
        </div>
      </AuthShell>
    );
  }

  if (phase === "done") {
    return (
      <AuthShell lang={lang} title={t.doneTitle}>
        <Notice tone="ok">{t.done}</Notice>
      </AuthShell>
    );
  }

  const strength = passwordStrength(password);

  return (
    <AuthShell lang={lang} title={t.title} subtitle={t.sub}>
      <form
        onSubmit={onSubmit}
        noValidate
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        {error && <Notice tone="error">{error}</Notice>}

        {/* The address is not editable here, but naming it stops a password
            manager saving the new password against the wrong account. */}
        <input
          type="email"
          value={auth.user?.email ?? ""}
          autoComplete="username"
          readOnly
          hidden
        />

        <Field label={t.password} hint={t.passwordHint}>
          {(id, describedBy) => (
            <>
              <PasswordInput
                id={id}
                describedBy={describedBy}
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                lang={lang}
              />
              {password.length > 0 && (
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
                            : "rgb(var(--veil-rgb) / .09)",
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </Field>

        <button type="submit" disabled={pending} style={primaryButton(pending)}>
          {pending ? t.working : t.save}
        </button>
      </form>
    </AuthShell>
  );
}
