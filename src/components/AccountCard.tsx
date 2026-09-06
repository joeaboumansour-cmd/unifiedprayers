"use client";

import { type CSSProperties, useState } from "react";

import type { Lang } from "@/lib/content";
import type { Auth } from "@/lib/useAuth";
import type { SyncStatus } from "@/lib/useCloudSync";

/**
 * Account strings live here rather than in design.json for the same reason the
 * palette names do: they describe a feature of this build, not the prayer text
 * the design file carries. The card is bilingual like the rest of Settings.
 */
const S = {
  ar: {
    title: "الحساب",
    blurb: "سجّل الدخول لتنتقل إعداداتك وموضعك بين أجهزتك.",
    email: "البريد الإلكتروني",
    sendLink: "أرسل رابط الدخول",
    sent: "تفقّد بريدك — أرسلنا لك رابط دخول.",
    signOut: "تسجيل الخروج",
    signedInAs: "مسجّل الدخول باسم",
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
    email: "Email address",
    sendLink: "Send sign-in link",
    sent: "Check your email — we sent you a sign-in link.",
    signOut: "Sign out",
    signedInAs: "Signed in as",
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
};

export default function AccountCard({
  lang,
  auth,
  syncStatus,
}: {
  lang: Lang;
  auth: Auth;
  syncStatus: SyncStatus;
}) {
  const [email, setEmail] = useState("");
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
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: "var(--dim-3)" }}>
                {s.signedInAs}
              </div>
              <div
                style={{
                  fontSize: 14.5,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  direction: "ltr",
                  textAlign: ar ? "right" : "left",
                }}
              >
                {auth.user?.email ?? auth.user?.id}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--dim-3)" }}>
                {s.status[syncStatus]}
              </div>
            </div>
            <button type="button" style={button} onClick={() => void auth.signOut()}>
              {s.signOut}
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: "16px",
            }}
          >
            <div style={{ fontSize: 12.5, color: "var(--dim-3)", lineHeight: 1.5 }}>
              {s.blurb}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim()) void auth.signInWithEmail(email.trim());
              }}
              style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (auth.error || auth.linkSent) auth.reset();
                }}
                placeholder={s.email}
                autoComplete="email"
                // The address is Latin script whichever way the page reads.
                dir="ltr"
                style={{
                  flex: "1 1 190px",
                  minWidth: 0,
                  appearance: "none",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,.12)",
                  background: "rgba(0,0,0,.28)",
                  padding: "10px 16px",
                  fontSize: 14,
                  color: "var(--ink)",
                  fontFamily: "inherit",
                }}
              />
              <button type="submit" style={button}>
                {s.sendLink}
              </button>
            </form>

            {auth.linkSent && (
              <div style={{ fontSize: 12.5, color: "var(--accent)", lineHeight: 1.5 }}>
                {s.sent}
              </div>
            )}
            {auth.error && (
              <div style={{ fontSize: 12.5, color: "#f2a2b0", lineHeight: 1.5 }}>
                {auth.error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
