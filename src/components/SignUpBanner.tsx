"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Auth } from "@/lib/useAuth";

/**
 * The invitation to make an account, shown on the Prayers tab to whoever is
 * praying without one.
 *
 * It sits under the streak strip because that is what it is about: the dots
 * and the day count above it live in this browser's localStorage and nowhere
 * else, so clearing the site, changing phone or reinstalling loses them. The
 * banner says that in the gentlest form it can — what signing up gains, not
 * what staying signed out costs — and it never blocks anything: the whole app
 * works without an account and keeps working after this is dismissed.
 *
 * Dismissal is a snooze rather than a refusal. Someone three days into a
 * streak has a reason to sign up that they did not have on day one, so the
 * banner comes back after a fortnight instead of going away for good. It is
 * kept per-device in localStorage, which is the only place a signed-out person
 * has.
 *
 * English only, whatever the app language is — it belongs with the account
 * surfaces it leads to (Settings, the login pages, the admin tab), which are
 * all English. Hence the dir="ltr" on the root: the app shell around it is
 * mirrored in Arabic, and English copy has to lay out as English inside it.
 */

/** Only this device could remember it, so this is the one place to put it. */
const DISMISS_KEY = "up.signupDismissedAt";
const DISMISS_DAYS = 14;

const S = {
  title: "Save your progress",
  body: "Your streak and prayers are kept on this device only. Create an account and they are saved online, and follow you to any other device.",
  signUp: "Create an account",
  signIn: "I have an account",
  close: "Dismiss",
} as const;

function snoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export default function SignUpBanner({ auth }: { auth: Auth }) {
  // localStorage cannot be read during the server render, and reading it in
  // the first client render would make that render disagree with the server's.
  // So the banner starts hidden and appears once the check has run.
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    setHidden(snoozed());
  }, []);

  // "loading" is the moment before a returning member's session is restored;
  // showing this then would ask a signed-in person to sign up. "disabled" is a
  // build with no Supabase project, where there is nothing to sign up for.
  if (auth.status !== "signed-out" || hidden) return null;

  const button = {
    display: "inline-flex",
    alignItems: "center",
    height: 34,
    padding: "0 14px",
    borderRadius: 999,
    fontSize: 12.5,
    fontWeight: 500,
    fontFamily: "inherit",
    textDecoration: "none",
    background: "rgb(var(--accent-rgb) / .9)",
    color: "var(--on-accent)",
  } as const;

  return (
    <div
      dir="ltr"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "13px 15px",
        borderRadius: 18,
        marginBottom: 14,
        background: "rgba(255,255,255,.045)",
        border: "1px solid rgba(255,255,255,.07)",
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>{S.title}</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--dim)" }}>
          {S.body}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          <Link href="/login?mode=signup" style={button}>
            {S.signUp}
          </Link>
          <Link
            href="/login"
            style={{
              ...button,
              background: "rgba(255,255,255,.05)",
              border: "1px solid rgba(255,255,255,.1)",
              color: "var(--soft)",
            }}
          >
            {S.signIn}
          </Link>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
          } catch {
            // A private window with storage refused still gets to close it,
            // for this launch at least.
          }
        }}
        aria-label={S.close}
        style={{
          flex: "none",
          appearance: "none",
          background: "none",
          border: "none",
          padding: 4,
          margin: -4,
          cursor: "pointer",
          color: "var(--dim-2)",
          fontSize: 16,
          lineHeight: 1,
          fontFamily: "inherit",
        }}
      >
        ×
      </button>
    </div>
  );
}
