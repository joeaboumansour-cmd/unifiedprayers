"use client";

import Link from "next/link";
import { type CSSProperties, useState } from "react";

import {
  Field,
  Notice,
  PasswordInput,
  primaryButton,
} from "@/components/auth/AuthShell";
import type { Lang } from "@/lib/content";
import type { Auth } from "@/lib/useAuth";
import type { SyncStatus } from "@/lib/useCloudSync";
import { useProfile } from "@/lib/useProfile";
import { PASSWORD_MIN, checkPassword } from "@/lib/username";

/**
 * Account strings live here rather than in design.json for the same reason the
 * palette names do: they describe a feature of this build, not the prayer text
 * the design file carries. The card is bilingual like the rest of Settings.
 */
const S = {
  ar: {
    title: "الحساب",
    blurb: "سجّل الدخول لتنتقل إعداداتك وموضعك بين أجهزتك.",
    signIn: "تسجيل الدخول",
    createAccount: "إنشاء حساب",
    signOut: "تسجيل الخروج",
    signedInAs: "مسجّل الدخول باسم",
    changePassword: "تغيير كلمة السر",
    currentPassword: "كلمة السر الحالية",
    newPassword: "كلمة السر الجديدة",
    confirmPassword: "أعد كتابة الجديدة",
    passwordHint: `${PASSWORD_MIN} أحرف على الأقل. الأطول أفضل من الأعقد.`,
    save: "حفظ",
    cancel: "إلغاء",
    working: "لحظة…",
    mismatch: "الكلمتان غير متطابقتين.",
    changed: "تم تغيير كلمة السر. تم تسجيل الخروج من الأجهزة الأخرى.",
    status: {
      idle: "محليًا فقط",
      syncing: "جارٍ المزامنة…",
      synced: "تمت المزامنة",
      offline: "بدون اتصال — سيُحفظ لاحقًا",
    } satisfies Record<SyncStatus, string>,
  },
  en: {
    title: "Account",
    blurb: "Sign in and your settings and place follow you between devices.",
    signIn: "Sign in",
    createAccount: "Create an account",
    signOut: "Sign out",
    signedInAs: "Signed in as",
    changePassword: "Change password",
    currentPassword: "Current password",
    newPassword: "New password",
    confirmPassword: "Type the new one again",
    passwordHint: `At least ${PASSWORD_MIN} characters. Longer beats more complicated.`,
    save: "Save",
    cancel: "Cancel",
    working: "One moment…",
    mismatch: "Those two do not match.",
    changed: "Your password is changed. Other devices have been signed out.",
    status: {
      idle: "On this device only",
      syncing: "Syncing…",
      synced: "Synced",
      offline: "Offline — will save later",
    } satisfies Record<SyncStatus, string>,
  },
} as const;

const card: CSSProperties = {
  borderRadius: 18,
  background: "rgba(255,255,255,.045)",
  border: "1px solid rgba(255,255,255,.07)",
  overflow: "hidden",
};

const sectionLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: "var(--dim-2)",
  marginBottom: 12,
};

const button: CSSProperties = {
  appearance: "none",
  border: "1px solid rgb(var(--accent-rgb) / .35)",
  borderRadius: 999,
  padding: "10px 18px",
  fontSize: 14,
  fontWeight: 500,
  color: "var(--accent)",
  background: "rgb(var(--accent-rgb) / .1)",
  cursor: "pointer",
  fontFamily: "inherit",
  textDecoration: "none",
  display: "inline-block",
};

/**
 * Changing a password from inside the app, with the current one as proof.
 *
 * This is the whole recovery story: no confirmation mail is sent and no reset
 * link exists, so a password can only be changed by someone who already knows
 * it and is already signed in.
 */
function ChangePassword({ lang, auth }: { lang: Lang; auth: Auth }) {
  const s = S[lang];
  const ar = lang === "ar";

  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const close = () => {
    setOpen(false);
    setCurrent("");
    setNext("");
    setAgain("");
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError(null);

    const pw = checkPassword(next, lang);
    if (!pw.ok) return setError(pw.reason);
    if (next !== again) return setError(s.mismatch);

    setPending(true);
    const res = await auth.changePassword(current, next, lang);
    setPending(false);
    if (!res.ok) return setError(res.message);

    close();
    setDone(true);
  };

  if (!open) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: "14px 16px",
          borderTop: "1px solid rgba(255,255,255,.06)",
          alignItems: ar ? "flex-end" : "flex-start",
        }}
      >
        <button
          type="button"
          style={{
            ...button,
            color: "var(--soft)",
            background: "rgba(255,255,255,.04)",
            border: "1px solid rgba(255,255,255,.1)",
          }}
          onClick={() => {
            setDone(false);
            setOpen(true);
          }}
        >
          {s.changePassword}
        </button>
        {done && <Notice tone="ok">{s.changed}</Notice>}
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: "16px",
        borderTop: "1px solid rgba(255,255,255,.06)",
      }}
    >
      {error && <Notice tone="error">{error}</Notice>}

      {/* Password managers key the saved entry on the account next to the
          fields; without it they offer to save a credential with no user. */}
      <input
        type="text"
        name="username"
        autoComplete="username"
        value={auth.user?.email ?? ""}
        readOnly
        hidden
      />

      <Field label={s.currentPassword}>
        {(id, describedBy) => (
          <PasswordInput
            id={id}
            describedBy={describedBy}
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            lang={lang}
          />
        )}
      </Field>

      <Field label={s.newPassword} hint={s.passwordHint}>
        {(id, describedBy) => (
          <PasswordInput
            id={id}
            describedBy={describedBy}
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            lang={lang}
          />
        )}
      </Field>

      <Field label={s.confirmPassword}>
        {(id, describedBy) => (
          <PasswordInput
            id={id}
            describedBy={describedBy}
            value={again}
            onChange={setAgain}
            autoComplete="new-password"
            lang={lang}
            invalid={again.length > 0 && again !== next}
          />
        )}
      </Field>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button type="submit" disabled={pending} style={primaryButton(pending)}>
          {pending ? s.working : s.save}
        </button>
        <button
          type="button"
          onClick={close}
          style={{
            ...button,
            flex: "none",
            color: "var(--dim-2)",
            background: "rgba(255,255,255,.04)",
            border: "1px solid rgba(255,255,255,.1)",
          }}
        >
          {s.cancel}
        </button>
      </div>
    </form>
  );
}

export default function AccountCard({
  lang,
  auth,
  syncStatus,
}: {
  lang: Lang;
  auth: Auth;
  syncStatus: SyncStatus;
}) {
  const { profile } = useProfile(auth.user?.id ?? null);
  const s = S[lang];
  const ar = lang === "ar";

  // No project configured, or the session is still being read from storage:
  // show nothing rather than a control that cannot work yet.
  if (auth.status === "disabled" || auth.status === "loading") return null;

  const signedIn = auth.status === "signed-in";

  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ ...sectionLabel, textAlign: ar ? "right" : "left" }}>
        {s.title}
      </div>

      <div style={card}>
        {signedIn ? (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "15px 16px",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  minWidth: 0,
                }}
              >
                <div style={{ fontSize: 11.5, color: "var(--dim-3)" }}>
                  {s.signedInAs}
                </div>
                <div
                  style={{
                    fontSize: 14.5,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    // The profile has not loaded offline; the email is a fine
                    // stand-in and is already on the device.
                    direction: "ltr",
                    textAlign: ar ? "right" : "left",
                  }}
                >
                  {profile ? `@${profile.username}` : (auth.user?.email ?? "")}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--dim-3)" }}>
                  {s.status[syncStatus]}
                </div>
              </div>
              <button
                type="button"
                style={button}
                onClick={() => void auth.signOut()}
              >
                {s.signOut}
              </button>
            </div>
            <ChangePassword lang={lang} auth={auth} />
          </>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: "16px",
              alignItems: ar ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{ fontSize: 12.5, color: "var(--dim-3)", lineHeight: 1.5 }}
            >
              {s.blurb}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/login" style={button}>
                {s.signIn}
              </Link>
              <Link
                href="/login?mode=signup"
                style={{
                  ...button,
                  color: "var(--soft)",
                  background: "rgba(255,255,255,.04)",
                  border: "1px solid rgba(255,255,255,.1)",
                }}
              >
                {s.createAccount}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
