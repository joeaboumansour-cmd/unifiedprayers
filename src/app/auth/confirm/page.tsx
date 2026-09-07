"use client";

import type { EmailOtpType } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import AuthShell, {
  Notice,
  linkButton,
  primaryButton,
} from "@/components/auth/AuthShell";
import { markRecovery } from "@/lib/authRecovery";
import { getSupabase } from "@/lib/supabase/client";
import { useAuthChrome } from "@/lib/useAuthChrome";

/* Where every link in an auth email lands.

   The email carries a token hash rather than Supabase's default confirmation
   URL, and this page redeems it with verifyOtp. That choice is the whole point
   of the page: the default flow hands back an authorisation code that can only
   be completed in the browser which started the request, and mail is not read
   in that browser. A token hash carries its own proof and works anywhere.

   Confirming is not a step to hurry past. It ends on a page that says so and
   offers the way in, rather than a redirect that drops somebody into the app
   wondering whether it worked. */

const COPY = {
  ar: {
    workingTitle: "لحظة…",
    workingSub: "نتحقق من الرابط.",

    doneTitle: "تم تأكيد بريدك",
    doneSub: "شكرًا لك. حسابك صار مفعّلًا.",
    // Almost everyone reads this inside their mail app's browser, which keeps
    // its own storage. The session just created lives there and not in the
    // installed app, so saying "you are in" would be true here and a lie on
    // their home screen a minute later.
    doneElsewhere:
      "فتحت هذا من بريدك؟ افتح تطبيق «صلوات موحّدة» وسجّل الدخول مرة واحدة، ثم تنتقل إعداداتك وموضعك بين أجهزتك.",
    startPraying: "ابدأ الصلاة",

    signInTitle: "بريدك مؤكَّد",
    signInSub:
      "إن كنت قد فتحت رابطًا من بريدك فالحساب صار مفعّلًا. سجّل الدخول للمتابعة.",
    toLogin: "تسجيل الدخول",

    badTitle: "الرابط لم يعد صالحًا",
    badSubSignup:
      "روابط التأكيد تنتهي بعد ٢٤ ساعة وتعمل مرة واحدة. إن كنت قد فتحته من قبل فالحساب مفعّل، وما عليك إلا تسجيل الدخول.",
    badSubRecovery:
      "روابط إعادة التعيين تنتهي بعد ساعة، وتعمل مرة واحدة فقط. اطلب رابطًا جديدًا.",
    newLink: "طلب رابط جديد",
    keepPraying: "الصلاة بلا حساب",
  },
  en: {
    workingTitle: "One moment…",
    workingSub: "Checking your link.",

    doneTitle: "Your email is confirmed",
    doneSub: "Thank you. Your account is now active.",
    doneElsewhere:
      "Opened this from your email? Open Unified Prayers and sign in there once — after that your settings and place follow you between devices.",
    startPraying: "Start praying",

    signInTitle: "Your email is confirmed",
    signInSub:
      "If you opened a link from your email, your account is now active. Sign in to continue.",
    toLogin: "Sign in",

    badTitle: "That link no longer works",
    badSubSignup:
      "Confirmation links last 24 hours and work once. If you have opened it before, your account is already active and you only need to sign in.",
    badSubRecovery: "Reset links last an hour and work once. Ask for a new one.",
    newLink: "Request a new link",
    keepPraying: "Pray without an account",
  },
} as const;

/** The link types this app actually sends. Anything else is treated as junk. */
const HANDLED = ["signup", "recovery", "email_change", "magiclink", "invite"];

type Phase =
  /** Redeeming, or waiting for the client to finish redeeming. */
  | { kind: "working" }
  /** Confirmed, and signed in on this device. */
  | { kind: "done" }
  /** Confirmed as far as anyone can tell, but with no session here. */
  | { kind: "signin" }
  /** Spent or expired. */
  | { kind: "bad"; reason: "signup" | "recovery" };

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

    // Read before the client is created. Supabase cleans auth parameters out of
    // the address bar as it initialises, and it is not fussy about which ones,
    // so anything still needed has to be taken first.
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const type = params.get("type") || "";
    const recovery = type === "recovery";

    const supabase = getSupabase();
    if (!supabase) {
      setPhase({ kind: "signin" });
      return;
    }

    const succeed = () => {
      if (recovery) {
        // Redeeming a recovery token signs the person in outright, which on its
        // own is indistinguishable from having been signed in all along. This
        // marks the tab so /reset-password knows the mailbox was just proved.
        markRecovery();
        router.replace("/reset-password");
        return;
      }
      setPhase({ kind: "done" });
    };

    const failed = () =>
      setPhase({ kind: "bad", reason: recovery ? "recovery" : "signup" });

    /* No usable token in the URL. Either it was redeemed on an earlier load --
       the account is confirmed and the parameters have been cleaned away -- or
       somebody typed the address in. Both look identical from here, so ask the
       session: signed in is confirmed and done, and signed out gets what is
       most likely true without claiming to know it. */
    if (!tokenHash || !HANDLED.includes(type)) {
      supabase.auth
        .getSession()
        .then(({ data }) =>
          setPhase(data.session ? { kind: "done" } : { kind: "signin" }),
        )
        .catch(() => setPhase({ kind: "signin" }));
      return;
    }

    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType })
      .then(({ error }) => {
        if (!error) return succeed();

        // A signup token usually fails because it was already spent -- by an
        // earlier load, or by a mail scanner opening the link before the person
        // did. The address is confirmed either way, so a session is worth
        // asking about before calling this a broken link.
        supabase.auth
          .getSession()
          .then(({ data }) => {
            if (data.session && !recovery) return setPhase({ kind: "done" });
            failed();
          })
          .catch(failed);
      })
      .catch(failed);
  }, [router]);

  if (!ready) return <AuthShell lang={lang} title="" />;

  const t = COPY[lang];
  // primaryButton is written for <button>; on an <a> it needs to fill the row
  // and centre its own text.
  const button = {
    ...primaryButton(false),
    display: "block",
    textAlign: "center" as const,
  };

  if (phase.kind === "working") {
    return (
      <AuthShell lang={lang} title={t.workingTitle} subtitle={t.workingSub} />
    );
  }

  if (phase.kind === "done") {
    return (
      <AuthShell lang={lang} title={t.doneTitle} subtitle={t.doneSub}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Link href="/" style={button}>
            {t.startPraying}
          </Link>
          <div
            style={{
              fontSize: 11.5,
              lineHeight: 1.6,
              color: "var(--dim-3)",
              textAlign: "center",
            }}
          >
            {t.doneElsewhere}
          </div>
        </div>
      </AuthShell>
    );
  }

  if (phase.kind === "signin") {
    return (
      <AuthShell lang={lang} title={t.signInTitle} subtitle={t.signInSub}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Link href="/login" style={button}>
            {t.toLogin}
          </Link>
          <div style={{ textAlign: "center" }}>
            <Link href="/" style={linkButton}>
              {t.keepPraying}
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell lang={lang} title={t.badTitle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Notice tone="info">
          {phase.reason === "recovery" ? t.badSubRecovery : t.badSubSignup}
        </Notice>
        <Link
          href={phase.reason === "recovery" ? "/login?mode=forgot" : "/login"}
          style={button}
        >
          {phase.reason === "recovery" ? t.newLink : t.toLogin}
        </Link>
      </div>
    </AuthShell>
  );
}
