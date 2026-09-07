"use client";

import type { EmailOtpType } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import AuthShell, { Notice, primaryButton } from "@/components/auth/AuthShell";
import { markRecovery } from "@/lib/authRecovery";
import { getSupabase } from "@/lib/supabase/client";
import { useAuthChrome } from "@/lib/useAuthChrome";

/* Where every link in an auth email lands.
 
   The email carries a token hash rather than Supabase's default confirmation
   URL, and this page redeems it with verifyOtp. That choice is the whole point
   of the page: the default flow is PKCE, whose verifier lives in the
   localStorage of the browser that started the request, so a link opened in
   the mail app's in-app browser -- which is most of them, on a phone -- fails
   with a "code verifier" error even though everything is configured correctly.
   A token hash carries its own proof and works in any browser, on any device. */

const COPY = {
  ar: {
    workingTitle: "لحظة…",
    workingSub: "نتحقق من الرابط.",
    badTitle: "الرابط لم يعد صالحًا",
    badSubSignup:
      "روابط التأكيد تنتهي بعد ٢٤ ساعة، وتعمل مرة واحدة فقط. اطلب رابطًا جديدًا من صفحة الدخول.",
    badSubRecovery:
      "روابط إعادة التعيين تنتهي بعد ساعة، وتعمل مرة واحدة فقط. اطلب رابطًا جديدًا.",
    badSubMissing:
      "هذا الرابط ناقص. افتح الرابط من رسالة البريد كما هو، دون نسخ جزء منه.",
    toLogin: "إلى صفحة الدخول",
    newLink: "طلب رابط جديد",
  },
  en: {
    workingTitle: "One moment…",
    workingSub: "Checking your link.",
    badTitle: "That link no longer works",
    badSubSignup:
      "Confirmation links last 24 hours and work once. Ask for a new one from the sign-in page.",
    badSubRecovery:
      "Reset links last an hour and work once. Ask for a new one.",
    badSubMissing:
      "That link is incomplete. Open it from the email as it is, rather than copying part of it.",
    toLogin: "Go to sign in",
    newLink: "Request a new link",
  },
} as const;

/** The link types this app actually sends. Anything else is treated as junk. */
const HANDLED = ["signup", "recovery", "email_change", "magiclink", "invite"];

type Phase =
  | { kind: "working" }
  | { kind: "bad"; reason: "missing" | "signup" | "recovery" };

export default function ConfirmPage() {
  const router = useRouter();
  const { lang, ready } = useAuthChrome();
  const [phase, setPhase] = useState<Phase>({ kind: "working" });

  /* The token is single use. React runs effects twice in development, and the
     second run would redeem an already-spent token and report a failure over a
     success that actually happened. */
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const type = params.get("type") || "";

    if (!tokenHash || !HANDLED.includes(type)) {
      setPhase({ kind: "bad", reason: "missing" });
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setPhase({ kind: "bad", reason: "missing" });
      return;
    }

    const recovery = type === "recovery";

    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType })
      .then(({ error }) => {
        if (error) {
          setPhase({ kind: "bad", reason: recovery ? "recovery" : "signup" });
          return;
        }

        // Redeeming a recovery token signs the person in outright, which on its
        // own is indistinguishable from having been signed in all along. This
        // marks the tab so /reset-password knows the mailbox was just proved.
        if (recovery) {
          markRecovery();
          router.replace("/reset-password");
          return;
        }

        // Confirmed, and already signed in by verifyOtp: send them into the app
        // rather than to a form asking for a password they just proved.
        router.replace("/");
      })
      .catch(() => {
        setPhase({ kind: "bad", reason: recovery ? "recovery" : "signup" });
      });
  }, [router]);

  if (!ready) return <AuthShell lang={lang} title="" />;

  const t = COPY[lang];

  if (phase.kind === "working") {
    return <AuthShell lang={lang} title={t.workingTitle} subtitle={t.workingSub} />;
  }

  const sub =
    phase.reason === "recovery"
      ? t.badSubRecovery
      : phase.reason === "signup"
        ? t.badSubSignup
        : t.badSubMissing;

  return (
    <AuthShell lang={lang} title={t.badTitle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Notice tone="info">{sub}</Notice>
        <Link
          href={phase.reason === "recovery" ? "/login?mode=forgot" : "/login"}
          style={{ ...primaryButton(false), display: "block", textAlign: "center" }}
        >
          {phase.reason === "recovery" ? t.newLink : t.toLogin}
        </Link>
      </div>
    </AuthShell>
  );
}
