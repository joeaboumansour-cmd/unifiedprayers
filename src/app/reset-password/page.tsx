"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AuthShell, {
  Field,
  Notice,
  PasswordInput,
  linkButton,
  primaryButton,
} from "@/components/auth/AuthShell";
import { type Lang, paletteInfo } from "@/lib/content";
import { readPrefs } from "@/lib/state";
import { useAuth } from "@/lib/useAuth";
import { PASSWORD_MIN, checkPassword, passwordStrength } from "@/lib/username";

const COPY = {
  ar: {
    title: "كلمة سر جديدة",
    sub: "اختر كلمة سر جديدة لحسابك.",
    password: "كلمة السر الجديدة",
    confirm: "أعد كتابتها",
    hint: `${PASSWORD_MIN} أحرف على الأقل. الأطول أفضل من الأعقد.`,
    save: "حفظ كلمة السر",
    working: "لحظة…",
    mismatch: "الكلمتان غير متطابقتين.",
    done: "تم تغيير كلمة السر. تم تسجيل الخروج من الأجهزة الأخرى.",
    toApp: "إلى التطبيق",
    invalidTitle: "الرابط غير صالح",
    invalidSub:
      "انتهت صلاحية الرابط أو استُخدم من قبل. اطلب رابطًا جديدًا لتغيير كلمة السر.",
    requestAgain: "اطلب رابطًا جديدًا",
  },
  en: {
    title: "Set a new password",
    sub: "Choose a new password for your account.",
    password: "New password",
    confirm: "Type it again",
    hint: `At least ${PASSWORD_MIN} characters. Longer beats more complicated.`,
    save: "Save password",
    working: "One moment…",
    mismatch: "Those two do not match.",
    done: "Your password is changed. Other devices have been signed out.",
    toApp: "Go to the app",
    invalidTitle: "That link is not valid",
    invalidSub:
      "It has expired or was already used. Ask for a fresh password reset link.",
    requestAgain: "Request a new link",
  },
} as const;

export default function ResetPasswordPage() {
  const router = useRouter();
  const auth = useAuth();

  const [lang, setLang] = useState<Lang>("ar");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const t = COPY[lang];

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
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError(null);

    const pw = checkPassword(password, lang);
    if (!pw.ok) return setError(pw.reason);
    if (password !== confirm) return setError(t.mismatch);

    setPending(true);
    const res = await auth.updatePassword(password, lang);
    setPending(false);
    if (!res.ok) return setError(res.message);

    setDone(true);
    setPassword("");
    setConfirm("");
  };

  if (auth.status === "loading") return <AuthShell lang={lang} title="" />;

  /*
   * Opening the emailed link puts a session in place before this renders, so
   * no session means the link was bad, expired, or already spent. Rather than
   * showing a form that cannot possibly work, say so and offer a new link.
   *
   * `recovering` is not required here: someone already signed in who navigates
   * to this page may legitimately change their password.
   */
  if (auth.status === "signed-out") {
    return (
      <AuthShell lang={lang} title={t.invalidTitle} subtitle={t.invalidSub}>
        <Link
          href="/login?mode=forgot"
          style={{ ...primaryButton(false), display: "block", textAlign: "center" }}
        >
          {t.requestAgain}
        </Link>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell lang={lang} title={t.title}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Notice tone="ok">{t.done}</Notice>
          <button
            type="button"
            onClick={() => router.replace("/")}
            style={primaryButton(false)}
          >
            {t.toApp}
          </button>
        </div>
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

        <Field label={t.password} hint={t.hint}>
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
                            : "rgba(255,255,255,.09)",
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </Field>

        <Field label={t.confirm}>
          {(id, describedBy) => (
            <PasswordInput
              id={id}
              describedBy={describedBy}
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              lang={lang}
              invalid={confirm.length > 0 && confirm !== password}
            />
          )}
        </Field>

        <button type="submit" disabled={pending} style={primaryButton(pending)}>
          {pending ? t.working : t.save}
        </button>
      </form>

      <div style={{ textAlign: "center", marginTop: 16 }}>
        <Link href="/login" style={linkButton}>
          {COPY[lang].toApp}
        </Link>
      </div>
    </AuthShell>
  );
}
