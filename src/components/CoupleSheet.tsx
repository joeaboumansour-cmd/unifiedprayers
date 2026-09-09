"use client";

import { useEffect, useState } from "react";

import { type Lang } from "@/lib/content";
import { sheetMotion, useSheetDrag } from "@/lib/useSheetDrag";
import type { Couple, JoinError } from "@/lib/useCouple";

const EASE = "cubic-bezier(.22,1,.36,1)";

const S = {
  ar: {
    title: "تأمّل الزوجين",
    lead: "هذا الكتاب مكتوب لاثنين يصلّيان معًا. اربط حسابك بحساب شريكك لتفتحاه.",
    signedOut: "سجّل الدخول أوّلاً لتتمكّن من الارتباط بشريكك.",
    signIn: "تسجيل الدخول",
    yourCode: "رمزك",
    codeHint: "شارك هذا الرمز مع شريكك ليُدخله عنده. صالح لسبعة أيّام.",
    makeCode: "أنشئ رمزًا",
    copy: "نسخ",
    copied: "تم النسخ",
    orEnter: "أو أدخل رمز شريكك",
    placeholder: "ABC123",
    joinBtn: "ارتبط",
    joining: "لحظة…",
    pairedWith: (n: string) => `أنتما مرتبطان مع ${n}.`,
    pairedNoName: "أنتما مرتبطان.",
    pairedNote: "تأمّل الزوجين مفتوح لكما الآن.",
    unlink: "فكّ الارتباط",
    confirmUnlink: "تأكيد فكّ الارتباط",
    unlinkHint: "فكّ الارتباط يُنهيه لكليكما.",
    close: "إغلاق",
    errors: {
      empty: "الرمز مؤلّف من ستّة أحرف وأرقام.",
      unknown: "لا يوجد رمز كهذا، أو انتهت صلاحيّته.",
      own: "هذا رمزك أنت. شاركه مع شريكك.",
      already: "أحد الحسابين مرتبط أصلًا.",
      failed: "تعذّر الارتباط. تحقّق من الاتصال.",
    } as Record<JoinError, string>,
  },
  en: {
    title: "For us",
    lead: "This book is written for two people praying together. Link your account with your partner's to open it.",
    signedOut: "Sign in first, then you can link with your partner.",
    signIn: "Sign in",
    yourCode: "Your code",
    codeHint: "Share this with your partner to enter on their phone. Good for seven days.",
    makeCode: "Create a code",
    copy: "Copy",
    copied: "Copied",
    orEnter: "Or enter your partner's code",
    placeholder: "ABC123",
    joinBtn: "Link",
    joining: "One moment…",
    pairedWith: (n: string) => `You are linked with ${n}.`,
    pairedNoName: "You are linked.",
    pairedNote: "For us is open to you both now.",
    unlink: "Unlink",
    confirmUnlink: "Confirm unlink",
    unlinkHint: "Unlinking ends it for both of you.",
    close: "Close",
    errors: {
      empty: "A code is six letters and numbers.",
      unknown: "No such code, or it has expired.",
      own: "That is your own code. Share it with your partner.",
      already: "One of the two accounts is already linked.",
      failed: "Could not link. Check your connection.",
    } as Record<JoinError, string>,
  },
} as const;

export type CoupleSheetProps = {
  open: boolean;
  lang: Lang;
  couple: Couple;
  /** Takes the reader to the sign-in screen. */
  onSignIn: () => void;
  onClose: () => void;
};

/**
 * The pairing sheet.
 *
 * Reached from the locked card, because that is where somebody finds out the
 * lock exists — a setting buried two tabs away would be the wrong answer to
 * "why can I not open this". It holds the whole mechanism: ask for a code,
 * type in a code, or see who you are already linked to.
 *
 * Both directions are on screen at once rather than behind a chooser. Two
 * people doing this are usually in the same room with one phone each, and
 * making them each pick "invite" or "join" first is a step that exists only to
 * save vertical space.
 */
export default function CoupleSheet({
  open,
  lang,
  couple,
  onSignIn,
  onClose,
}: CoupleSheetProps) {
  const s = S[lang];
  const ar = lang === "ar";

  const [entry, setEntry] = useState("");
  const [error, setError] = useState<JoinError | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const drag = useSheetDrag(open, onClose);

  // A sheet that opens holding the last attempt's error is a sheet that looks
  // broken before it has been touched.
  useEffect(() => {
    if (open) return;
    setEntry("");
    setError(null);
    setCopied(false);
    setConfirming(false);
  }, [open]);

  const join = async () => {
    if (busy) return;
    setBusy(true);
    setError(await couple.join(entry));
    setBusy(false);
  };

  const copy = async () => {
    if (!couple.code) return;
    try {
      await navigator.clipboard.writeText(couple.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* Denied, or no clipboard. The code is on screen to be read out. */
    }
  };

  const label: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: ".08em",
    textTransform: "uppercase",
    color: "var(--dim-2)",
  };

  const button = (tone: "accent" | "quiet" | "danger"): React.CSSProperties => {
    const c = {
      accent: { fg: "var(--on-accent)", bg: "rgb(var(--accent-rgb) / .9)", br: "transparent" },
      quiet: { fg: "var(--soft)", bg: "rgb(var(--veil-rgb) / .05)", br: "rgb(var(--veil-rgb) / .12)" },
      danger: { fg: "var(--danger)", bg: "rgb(var(--danger-rgb) / .1)", br: "rgb(var(--danger-rgb) / .35)" },
    }[tone];
    return {
      appearance: "none",
      borderRadius: 999,
      padding: "11px 18px",
      fontSize: 14,
      fontWeight: 500,
      fontFamily: "inherit",
      cursor: "pointer",
      color: c.fg,
      background: c.bg,
      border: `1px solid ${c.br}`,
    };
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 44,
          background: "var(--scrim)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          transition: "opacity .35s ease",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
      />
      <div
        role="dialog"
        aria-modal={open}
        aria-label={s.title}
        dir={ar ? "rtl" : "ltr"}
        style={{
          position: "absolute",
          insetInline: 0,
          bottom: 0,
          zIndex: 45,
          borderRadius: "28px 28px 0 0",
          background: "var(--surface)",
          borderTop: "1px solid rgb(var(--veil-rgb) / .1)",
          padding: "14px 20px max(22px, var(--safe-b))",
          maxHeight: "88%",
          overflowY: "auto",
          boxShadow: "0 -20px 60px rgb(var(--shadow-rgb) / var(--shadow-a))",
          ...sheetMotion(open, drag, "105%", EASE),
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {/* The grab area. The drag lives here rather than on the whole sheet
            because the sheet's body scrolls, and a sheet that both scrolls and
            drags from the same pixels has to guess which one a finger meant.
            The bar is what looks draggable, so the bar is what drags — and it
            gets padding well beyond its 4px so it is a real target. */}
        <div
          {...drag.handlers}
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "4px 0 18px",
            margin: "-4px 0 0",
            cursor: "grab",
            // The browser must not also try to scroll with this finger.
            touchAction: "none",
          }}
        >
          <div
            style={{
              width: 38,
              height: 4,
              borderRadius: 999,
              background: "rgb(var(--veil-rgb) / .22)",
            }}
          />
        </div>

        <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
          {s.title}
        </div>

        {couple.status === "paired" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: "var(--soft-2)" }}>
              {couple.partnerName ? s.pairedWith(couple.partnerName) : s.pairedNoName}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--accent-ink)" }}>
              {s.pairedNote}
            </div>
            <div style={{ fontSize: 12, color: "var(--dim-3)", lineHeight: 1.6 }}>
              {s.unlinkHint}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                style={button("danger")}
                onClick={() => {
                  if (!confirming) return setConfirming(true);
                  void couple.leave();
                  setConfirming(false);
                }}
              >
                {confirming ? s.confirmUnlink : s.unlink}
              </button>
              <button type="button" style={button("quiet")} onClick={onClose}>
                {s.close}
              </button>
            </div>
          </div>
        ) : couple.status === "signed-out" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: "var(--soft-2)" }}>
              {s.lead}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--dim)" }}>
              {s.signedOut}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" style={button("accent")} onClick={onSignIn}>
                {s.signIn}
              </button>
              <button type="button" style={button("quiet")} onClick={onClose}>
                {s.close}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: "var(--soft-2)" }}>
              {s.lead}
            </div>

            {/* half one: hand a code over */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={label}>{s.yourCode}</div>
              {couple.code ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      dir="ltr"
                      className="selectable"
                      style={{
                        flex: 1,
                        minWidth: 150,
                        textAlign: "center",
                        padding: "14px 16px",
                        borderRadius: 14,
                        background: "rgb(var(--accent-rgb) / .1)",
                        border: "1px solid rgb(var(--accent-rgb) / .3)",
                        color: "var(--accent-ink)",
                        fontSize: 26,
                        fontWeight: 600,
                        // The code is read off one screen and typed into
                        // another, so the characters must not be proportional.
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        letterSpacing: ".22em",
                      }}
                    >
                      {couple.code}
                    </div>
                    <button type="button" style={button("quiet")} onClick={copy}>
                      {copied ? s.copied : s.copy}
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--dim-3)", lineHeight: 1.6 }}>
                    {s.codeHint}
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  style={button("accent")}
                  onClick={() => void couple.invite()}
                >
                  {s.makeCode}
                </button>
              )}
            </div>

            {/* half two: take one */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={label}>{s.orEnter}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  value={entry}
                  dir="ltr"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={7}
                  placeholder={s.placeholder}
                  onChange={(e) => {
                    setEntry(e.target.value.toUpperCase());
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void join();
                  }}
                  style={{
                    appearance: "none",
                    flex: 1,
                    minWidth: 140,
                    boxSizing: "border-box",
                    textAlign: "center",
                    background: "rgb(var(--veil-rgb) / .05)",
                    border: `1px solid ${
                      error ? "rgb(var(--danger-rgb) / .5)" : "rgb(var(--veil-rgb) / .1)"
                    }`,
                    borderRadius: 14,
                    padding: "13px 14px",
                    color: "var(--body)",
                    // 15px minimum or iOS Safari zooms the viewport on focus.
                    fontSize: 20,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    letterSpacing: ".22em",
                  }}
                />
                <button
                  type="button"
                  style={button("accent")}
                  onClick={() => void join()}
                  disabled={busy}
                >
                  {busy ? s.joining : s.joinBtn}
                </button>
              </div>
              {error && (
                <div
                  role="status"
                  style={{ fontSize: 13, lineHeight: 1.6, color: "var(--danger)" }}
                >
                  {s.errors[error]}
                </div>
              )}
            </div>

            <button type="button" style={button("quiet")} onClick={onClose}>
              {s.close}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
