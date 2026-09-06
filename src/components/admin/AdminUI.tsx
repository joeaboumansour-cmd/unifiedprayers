"use client";

import {
  type CSSProperties,
  type ReactNode,
  type TextareaHTMLAttributes,
  useEffect,
  useState,
} from "react";

import { getSupabase } from "@/lib/supabase/client";

/**
 * The admin tab's shared pieces.
 *
 * All of it is bilingual but none of it comes from the content documents, for
 * the same reason the account and install copy does not: this is chrome about
 * running the app, not text anyone prays. Putting "Publish" in design.json
 * would also mean an admin could break the button they need in order to fix it.
 */

export const card: CSSProperties = {
  borderRadius: 18,
  background: "rgba(255,255,255,.045)",
  border: "1px solid rgba(255,255,255,.07)",
  padding: 16,
};

export const sectionLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: "var(--dim-2)",
  marginBottom: 12,
};

export const inputStyle = (invalid = false): CSSProperties => ({
  appearance: "none",
  width: "100%",
  boxSizing: "border-box",
  background: "rgba(255,255,255,.05)",
  border: `1px solid ${invalid ? "rgba(242,162,176,.5)" : "rgba(255,255,255,.1)"}`,
  borderRadius: 12,
  padding: "11px 13px",
  color: "var(--body)",
  // 15px at minimum, or iOS Safari zooms the viewport when a field is focused.
  fontSize: 15,
  fontFamily: "inherit",
  lineHeight: 1.4,
});

export function Button({
  children,
  onClick,
  disabled = false,
  tone = "accent",
  wide = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "accent" | "quiet" | "danger";
  wide?: boolean;
  type?: "button" | "submit";
}) {
  const colours = {
    accent: { fg: "var(--accent)", bg: "rgb(var(--accent-rgb) / .12)", br: "rgb(var(--accent-rgb) / .35)" },
    quiet: { fg: "var(--soft)", bg: "rgba(255,255,255,.05)", br: "rgba(255,255,255,.12)" },
    danger: { fg: "#f2a2b0", bg: "rgba(242,162,176,.1)", br: "rgba(242,162,176,.35)" },
  }[tone];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        appearance: "none",
        width: wide ? "100%" : undefined,
        border: `1px solid ${disabled ? "rgba(255,255,255,.08)" : colours.br}`,
        borderRadius: 999,
        padding: wide ? "13px 18px" : "9px 16px",
        fontSize: wide ? 15 : 13.5,
        fontWeight: 500,
        color: disabled ? "var(--dim-3)" : colours.fg,
        background: disabled ? "rgba(255,255,255,.03)" : colours.bg,
        cursor: disabled ? "default" : "pointer",
        fontFamily: "inherit",
        transition: "background .2s ease, color .2s ease",
      }}
    >
      {children}
    </button>
  );
}

export function Labelled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13, color: "var(--soft)" }}>{label}</span>
      {children}
      {hint && (
        <span style={{ fontSize: 11.5, color: "var(--dim-3)", lineHeight: 1.5 }}>
          {hint}
        </span>
      )}
    </div>
  );
}

/**
 * A textarea that grows with its content. Admin text is a sentence or a
 * paragraph, and a fixed three-row box is wrong for both.
 */
export function TextArea({
  value,
  onChange,
  rows = 3,
  dir,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  dir?: "rtl" | "ltr";
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "dir">) {
  return (
    <textarea
      value={value}
      dir={dir}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...inputStyle(), resize: "vertical", lineHeight: 1.7 }}
      {...rest}
    />
  );
}

/**
 * The two-language pair every publishable string is made of.
 *
 * Side by side rather than behind a language switch on purpose: an admin
 * writing one half and forgetting the other is the failure this whole surface
 * is most prone to, and the empty box next to the full one is the reminder.
 */
export function Bilingual({
  label,
  ar,
  en,
  onAr,
  onEn,
  rows,
  arPlaceholder,
  enPlaceholder,
}: {
  label: string;
  ar: string;
  en: string;
  onAr: (v: string) => void;
  onEn: (v: string) => void;
  rows?: number;
  arPlaceholder?: string;
  enPlaceholder?: string;
}) {
  return (
    <Labelled label={label}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <TextArea
          value={ar}
          onChange={onAr}
          rows={rows ?? 2}
          dir="rtl"
          placeholder={arPlaceholder ?? "بالعربية"}
          aria-label={`${label} — العربية`}
        />
        <TextArea
          value={en}
          onChange={onEn}
          rows={rows ?? 2}
          dir="ltr"
          placeholder={enPlaceholder ?? "In English"}
          aria-label={`${label} — English`}
        />
      </div>
    </Labelled>
  );
}

/** A row of mutually exclusive choices. Used for kind, audience, status. */
export function Choice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={on}
            style={{
              appearance: "none",
              borderRadius: 999,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "inherit",
              cursor: "pointer",
              transition: "background .2s ease, color .2s ease",
              color: on ? "var(--on-accent)" : "var(--soft)",
              background: on ? "rgb(var(--accent-rgb) / .9)" : "rgba(255,255,255,.05)",
              border: `1px solid ${on ? "transparent" : "rgba(255,255,255,.1)"}`,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({
  on,
  label,
  onToggle,
}: {
  on: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      style={{
        appearance: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        width: "100%",
        padding: "11px 13px",
        borderRadius: 12,
        background: "rgba(255,255,255,.04)",
        border: "1px solid rgba(255,255,255,.08)",
        color: "var(--soft)",
        fontSize: 13.5,
        fontFamily: "inherit",
        cursor: "pointer",
      }}
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        style={{
          flex: "none",
          width: 40,
          height: 23,
          borderRadius: 999,
          padding: 2,
          display: "flex",
          background: on ? "rgb(var(--accent-rgb) / .85)" : "rgba(255,255,255,.12)",
          transition: "background .25s ease",
        }}
      >
        <span
          style={{
            width: 19,
            height: 19,
            borderRadius: "50%",
            background: on ? "var(--on-accent)" : "var(--soft)",
            // The tab bar mirrors in Arabic; the knob has to travel the same way.
            transform: on ? "translateX(var(--knob, 17px))" : "none",
            transition: "transform .25s cubic-bezier(.22,1,.36,1)",
          }}
        />
      </span>
    </button>
  );
}

/**
 * The single line of feedback every panel reports through.
 *
 * Admin actions publish to everyone, so "did that work" cannot be left to
 * inference from the list re-rendering. Errors stay until they are replaced;
 * successes clear themselves, because a stale "Saved" next to an edited form is
 * worse than no message at all.
 */
export type Toast = { tone: "ok" | "bad"; text: string } | null;

export function ToastLine({ toast }: { toast: Toast }) {
  if (!toast) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: "10px 13px",
        borderRadius: 12,
        fontSize: 13,
        lineHeight: 1.6,
        color: toast.tone === "ok" ? "var(--accent)" : "#f2a2b0",
        background:
          toast.tone === "ok"
            ? "rgb(var(--accent-rgb) / .1)"
            : "rgba(242,162,176,.1)",
        border: `1px solid ${
          toast.tone === "ok"
            ? "rgb(var(--accent-rgb) / .25)"
            : "rgba(242,162,176,.3)"
        }`,
      }}
    >
      {toast.text}
    </div>
  );
}

/** Clears an "ok" toast after a moment; leaves failures on screen. */
export function useToast(): [Toast, (t: Toast) => void] {
  const [toast, setToast] = useState<Toast>(null);
  useEffect(() => {
    if (toast?.tone !== "ok") return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);
  return [toast, setToast];
}

/* --------------------------------- calls --------------------------------- */

/**
 * Calls one of the /api/admin routes with the caller's session attached.
 *
 * The token is fetched per call rather than held: it expires, and the client
 * refreshes it in the background, so a copy taken when the tab was opened would
 * be the stale one by the time anything is published.
 */
export async function adminFetch(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const supabase = getSupabase();
  const { data: session } = (await supabase?.auth.getSession()) ?? { data: null };
  const token = session?.session?.access_token;

  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });

  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* an empty or non-JSON body — the status still carries the answer */
  }
  return { ok: res.ok, status: res.status, data };
}
