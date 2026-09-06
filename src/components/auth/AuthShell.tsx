"use client";

import Link from "next/link";
import {
  type CSSProperties,
  type ReactNode,
  forwardRef,
  useId,
  useState,
} from "react";

import type { Lang } from "@/lib/content";

/* Shared chrome for the auth pages, so /login and /reset-password cannot
   drift apart. Styling matches Settings: same card fill, same pill controls,
   same palette tokens, so these read as part of the app and not a bolted-on
   form. */

export const AUTH_COPY = {
  ar: {
    back: "رجوع إلى الصلاة",
    show: "إظهار",
    hide: "إخفاء",
    required: "مطلوب",
    optional: "اختياري",
  },
  en: {
    back: "Back to praying",
    show: "Show",
    hide: "Hide",
    required: "Required",
    optional: "Optional",
  },
} as const;

const card: CSSProperties = {
  borderRadius: 22,
  background: "rgba(255,255,255,.045)",
  border: "1px solid rgba(255,255,255,.07)",
  padding: "22px 20px",
};

export const primaryButton = (disabled: boolean): CSSProperties => ({
  appearance: "none",
  width: "100%",
  border: "1px solid rgb(var(--accent-rgb) / .35)",
  borderRadius: 999,
  padding: "13px 18px",
  fontSize: 15,
  fontWeight: 600,
  color: disabled ? "var(--dim-3)" : "var(--accent)",
  background: disabled ? "rgba(255,255,255,.03)" : "rgb(var(--accent-rgb) / .12)",
  cursor: disabled ? "default" : "pointer",
  fontFamily: "inherit",
  transition: "background .2s ease, color .2s ease",
  // Also used on <a> (the "request a new link" action), which would otherwise
  // carry the browser's underline into a control that reads as a button.
  textDecoration: "none",
});

export const linkButton: CSSProperties = {
  appearance: "none",
  background: "none",
  border: "none",
  padding: 0,
  fontSize: 13,
  color: "var(--accent)",
  cursor: "pointer",
  fontFamily: "inherit",
  textDecoration: "none",
};

/** One page-level message. `tone` decides colour, never layout. */
export function Notice({
  tone,
  children,
}: {
  tone: "error" | "ok" | "info";
  children: ReactNode;
}) {
  const colour =
    tone === "error" ? "#f2a2b0" : tone === "ok" ? "var(--accent)" : "var(--dim-3)";
  return (
    <div
      // Announced to screen readers when it appears, which is the whole point
      // of a form error nobody is looking at yet.
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      style={{
        fontSize: 12.5,
        lineHeight: 1.55,
        color: colour,
        background: tone === "error" ? "rgba(242,162,176,.07)" : "transparent",
        border:
          tone === "error" ? "1px solid rgba(242,162,176,.2)" : "1px solid transparent",
        borderRadius: 12,
        padding: tone === "error" ? "10px 12px" : "0 2px",
      }}
    >
      {children}
    </div>
  );
}

type FieldProps = {
  label: string;
  hint?: string;
  error?: string | null;
  /** Shown next to the label, e.g. "Optional". */
  badge?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
};

/** Label, control, hint and error, wired together for screen readers. */
export function Field({ label, hint, error, badge, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <label htmlFor={id} style={{ fontSize: 13, color: "var(--soft)" }}>
          {label}
        </label>
        {badge && (
          <span style={{ fontSize: 11, color: "var(--dim-3)" }}>{badge}</span>
        )}
      </div>
      {children(id, describedBy)}
      {hint && !error && (
        <div id={hintId} style={{ fontSize: 11.5, color: "var(--dim-3)", lineHeight: 1.5 }}>
          {hint}
        </div>
      )}
      {error && (
        <div
          id={errorId}
          style={{ fontSize: 11.5, color: "#f2a2b0", lineHeight: 1.5 }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

const inputStyle = (invalid: boolean): CSSProperties => ({
  appearance: "none",
  width: "100%",
  borderRadius: 14,
  border: `1px solid ${invalid ? "rgba(242,162,176,.45)" : "rgba(255,255,255,.12)"}`,
  background: "rgba(0,0,0,.28)",
  padding: "12px 14px",
  fontSize: 15,
  color: "var(--ink)",
  fontFamily: "inherit",
  // 15px or more, or iOS Safari zooms the viewport on focus.
  lineHeight: 1.3,
});

export const TextInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function TextInput({ invalid = false, style, ...rest }, ref) {
  return (
    <input
      ref={ref}
      // Addresses, usernames and passwords are Latin script whichever way the
      // page reads, and mirroring them makes them unreadable.
      dir="ltr"
      style={{ ...inputStyle(invalid), ...style }}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
});

/**
 * A password field with a show/hide toggle.
 *
 * `autoComplete` is required rather than optional: getting it wrong is how a
 * password manager ends up saving the old password over the new one, and there
 * is no sensible default that suits both signing in and choosing a new one.
 */
export function PasswordInput({
  id,
  describedBy,
  value,
  onChange,
  autoComplete,
  lang,
  invalid = false,
  placeholder,
}: {
  id: string;
  describedBy?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  lang: Lang;
  invalid?: boolean;
  placeholder?: string;
}) {
  const [shown, setShown] = useState(false);
  const t = AUTH_COPY[lang];
  return (
    <div style={{ position: "relative", display: "flex" }}>
      <TextInput
        id={id}
        aria-describedby={describedBy}
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        invalid={invalid}
        required
        style={{ paddingInlineEnd: 62 }}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        // Never part of the tab order between password and submit; it is a
        // convenience, and stepping through it every time is a nuisance.
        tabIndex={-1}
        style={{
          position: "absolute",
          insetInlineEnd: 10,
          top: 0,
          bottom: 0,
          background: "none",
          border: "none",
          color: "var(--dim-3)",
          fontSize: 11.5,
          cursor: "pointer",
          fontFamily: "inherit",
          padding: "0 4px",
        }}
      >
        {shown ? t.hide : t.show}
      </button>
    </div>
  );
}

/** The page frame: centred card, app background, a way back to the prayers. */
export default function AuthShell({
  lang,
  title,
  subtitle,
  children,
}: {
  lang: Lang;
  title: string;
  subtitle?: string;
  /** Absent while the session is still being read: an empty frame, not a flash
      of a form that is about to be replaced. */
  children?: ReactNode;
}) {
  const ar = lang === "ar";
  return (
    <main
      dir={ar ? "rtl" : "ltr"}
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "max(24px, var(--safe-t)) 20px max(24px, var(--safe-b))",
        gap: 18,
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 600,
            margin: "0 0 6px",
            color: "var(--ink)",
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              fontSize: 13.5,
              lineHeight: 1.6,
              color: "var(--dim-3)",
              margin: "0 0 18px",
            }}
          >
            {subtitle}
          </p>
        )}
        <div style={card}>{children}</div>

        <div style={{ textAlign: "center", marginTop: 18 }}>
          <Link href="/" style={{ ...linkButton, color: "var(--dim-3)" }}>
            {AUTH_COPY[lang].back}
          </Link>
        </div>
      </div>
    </main>
  );
}
