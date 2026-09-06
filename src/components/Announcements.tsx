"use client";

import { useEffect, useState } from "react";

import type { Lang } from "@/lib/content";
import type { AnnouncementRow } from "@/lib/supabase/types";

/**
 * Announcements on screen: a banner at the top of the Prayers tab, and a modal
 * over the app on open.
 *
 * Both are written from the same row, and both open the link in a new tab with
 * `noopener`. The URL is an https string an admin typed, and the schema will
 * not store anything else — but a link out of a prayer app should not be able
 * to reach back into the window it came from either way.
 */

const EASE = "cubic-bezier(.22,1,.36,1)";

const CLOSE = { ar: "إغلاق", en: "Close" } as const;

const pick = (lang: Lang, ar: string | null, en: string | null): string | null =>
  (lang === "ar" ? ar : en) || null;

/* --------------------------------- banner -------------------------------- */

export function AnnouncementBanner({
  row,
  lang,
  onDismiss,
}: {
  row: AnnouncementRow;
  lang: Lang;
  onDismiss: () => void;
}) {
  const title = pick(lang, row.title_ar, row.title_en);
  const body = pick(lang, row.body_ar, row.body_en);
  const cta = pick(lang, row.cta_label_ar, row.cta_label_en);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "13px 15px",
        borderRadius: 18,
        marginBottom: 14,
        background:
          "linear-gradient(135deg,rgb(var(--accent-rgb) / .12),rgb(var(--accent-rgb) / .04))",
        border: "1px solid rgb(var(--accent-rgb) / .2)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        {body && (
          <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--dim)" }}>
            {body}
          </div>
        )}
        {row.cta_url && cta && (
          <a
            href={row.cta_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              marginTop: 4,
              fontSize: 12.5,
              fontWeight: 500,
              color: "var(--accent)",
              textDecoration: "none",
            }}
          >
            {cta} →
          </a>
        )}
      </div>

      {row.dismissible && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={CLOSE[lang]}
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
      )}
    </div>
  );
}

/* --------------------------------- modal --------------------------------- */

export function AnnouncementModal({
  row,
  lang,
  onDismiss,
}: {
  row: AnnouncementRow;
  lang: Lang;
  onDismiss: () => void;
}) {
  // Mounted at opacity 0 and raised on the next frame, so it fades in rather
  // than appearing on top of an app that has not finished painting.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setShown(true), 400);
    return () => window.clearTimeout(id);
  }, []);

  // Escape closes it, like every other layer in the app. Only when it can be
  // closed at all — a notice marked non-dismissible has no exit by design.
  useEffect(() => {
    if (!row.dismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row.dismissible, onDismiss]);

  const title = pick(lang, row.title_ar, row.title_en);
  const body = pick(lang, row.body_ar, row.body_en);
  const cta = pick(lang, row.cta_label_ar, row.cta_label_en);

  return (
    <>
      <div
        onClick={row.dismissible ? onDismiss : undefined}
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--scrim)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          transition: "opacity .4s ease",
          opacity: shown ? 1 : 0,
          zIndex: 40,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title ?? undefined}
        style={{
          position: "absolute",
          insetInline: 20,
          top: "50%",
          zIndex: 41,
          borderRadius: 24,
          background: "var(--surface)",
          border: "1px solid rgba(255,255,255,.1)",
          boxShadow: "0 24px 70px rgba(0,0,0,.55)",
          padding: 22,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          transition: `transform .5s ${EASE}, opacity .4s ease`,
          transform: shown ? "translateY(-50%) scale(1)" : "translateY(-50%) scale(.94)",
          opacity: shown ? 1 : 0,
          pointerEvents: shown ? "auto" : "none",
        }}
      >
        {row.image_url && (
          // eslint-disable-next-line @next/next/no-img-element -- an arbitrary
          // remote host an admin typed; next/image would need it configured.
          <img
            src={row.image_url}
            alt=""
            style={{
              width: "100%",
              maxHeight: 180,
              objectFit: "cover",
              borderRadius: 14,
              marginBottom: 4,
            }}
          />
        )}

        <div style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.35 }}>{title}</div>
        {body && (
          <div
            className="selectable"
            style={{ fontSize: 14, lineHeight: 1.85, color: "var(--soft)" }}
          >
            {body}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
          {row.cta_url && cta && (
            <a
              href={row.cta_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onDismiss}
              style={{
                appearance: "none",
                textAlign: "center",
                border: "1px solid rgb(var(--accent-rgb) / .35)",
                borderRadius: 999,
                padding: "13px 18px",
                fontSize: 15,
                fontWeight: 600,
                color: "var(--accent)",
                background: "rgb(var(--accent-rgb) / .12)",
                textDecoration: "none",
              }}
            >
              {cta}
            </a>
          )}
          {row.dismissible && (
            <button
              type="button"
              onClick={onDismiss}
              style={{
                appearance: "none",
                border: "none",
                background: "none",
                padding: "10px 0",
                fontSize: 14,
                color: "var(--dim)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {CLOSE[lang]}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
