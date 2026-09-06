"use client";

import type { CSSProperties } from "react";

import type { Lang } from "@/lib/content";
import type { Push } from "@/lib/usePush";

/**
 * The notifications row in Settings.
 *
 * Most of this component is the states where the answer is not a toggle. On
 * iOS, Web Push exists only for a PWA on the Home Screen — in Safari the API is
 * simply absent — so a switch there would be a control that silently does
 * nothing. The instructions shown instead are the actual fix.
 */

const S = {
  ar: {
    title: "الإشعارات",
    blurb: "تذكير يومي، ورسائل نادرة من التطبيق.",
    enable: "تفعيل الإشعارات",
    enabled: "الإشعارات مفعّلة",
    disable: "إيقاف",
    working: "لحظة…",
    blocked:
      "الإشعارات ممنوعة لهذا الموقع في إعدادات المتصفح. فعّلها من هناك أولًا.",
    unsupported: "متصفحك لا يدعم الإشعارات.",
    unconfigured: "الإشعارات غير متاحة حاليًا.",
    needsInstall: "أضف التطبيق إلى الشاشة الرئيسية أولًا",
    iosSteps:
      "على iPhone تصل الإشعارات إلى التطبيق المثبّت فقط. من زر المشاركة في سفاري اختر «إضافة إلى الشاشة الرئيسية»، ثم افتح التطبيق من أيقونته وعد إلى هنا.",
    reminder: "تذكير يومي",
    reminderOff: "بدون تذكير",
    reminderHint: "بتوقيت جهازك.",
  },
  en: {
    title: "Notifications",
    blurb: "A daily reminder, and the occasional message from the app.",
    enable: "Turn on notifications",
    enabled: "Notifications are on",
    disable: "Turn off",
    working: "One moment…",
    blocked:
      "Notifications are blocked for this site in your browser settings. Allow them there first.",
    unsupported: "This browser does not support notifications.",
    unconfigured: "Notifications are not available right now.",
    needsInstall: "Add the app to your Home Screen first",
    iosSteps:
      "On iPhone, notifications only reach the installed app. In Safari tap Share, choose “Add to Home Screen”, open the app from its icon, and come back here.",
    reminder: "Daily reminder",
    reminderOff: "No reminder",
    reminderHint: "In your device's own time.",
  },
} as const;

const card: CSSProperties = {
  borderRadius: 18,
  background: "rgba(255,255,255,.045)",
  border: "1px solid rgba(255,255,255,.07)",
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const button = (disabled: boolean): CSSProperties => ({
  appearance: "none",
  border: `1px solid ${disabled ? "rgba(255,255,255,.08)" : "rgb(var(--accent-rgb) / .35)"}`,
  borderRadius: 999,
  padding: "11px 18px",
  fontSize: 14,
  fontWeight: 500,
  color: disabled ? "var(--dim-3)" : "var(--accent)",
  background: disabled ? "rgba(255,255,255,.03)" : "rgb(var(--accent-rgb) / .12)",
  cursor: disabled ? "default" : "pointer",
  fontFamily: "inherit",
});

/** 24 hours as a picker. Evening first would be presumptuous; 0–23 is honest. */
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const formatHour = (h: number, lang: Lang): string =>
  new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en", {
    hour: "numeric",
    hour12: lang !== "ar",
  }).format(new Date(2024, 0, 1, h));

export default function NotificationsCard({
  lang,
  push,
}: {
  lang: Lang;
  push: Push;
}) {
  const s = S[lang];

  // Nothing to offer and nothing to explain: an old browser is not a problem
  // the reader can act on, so the card stays out of the way entirely.
  if (push.state === "checking" || push.state === "unsupported") return null;

  return (
    <div style={card}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{s.title}</div>
        <div style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.7 }}>
          {s.blurb}
        </div>
      </div>

      {push.state === "needs-install" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--soft)" }}>
            {s.needsInstall}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.8 }}>
            {s.iosSteps}
          </div>
        </div>
      )}

      {push.state === "blocked" && (
        <div style={{ fontSize: 12.5, color: "#f2a2b0", lineHeight: 1.8 }}>
          {s.blocked}
        </div>
      )}

      {push.state === "unconfigured" && (
        <div style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.8 }}>
          {s.unconfigured}
        </div>
      )}

      {push.state === "off" && (
        <button
          type="button"
          onClick={() => push.enable()}
          disabled={push.busy}
          style={button(push.busy)}
        >
          {push.busy ? s.working : s.enable}
        </button>
      )}

      {/* Below the button rather than replacing it: whatever went wrong, the
          next thing to do is almost always to tap it again. */}
      {push.error && (
        <div
          role="status"
          aria-live="polite"
          style={{ fontSize: 12.5, color: "#f2a2b0", lineHeight: 1.8 }}
        >
          {push.error}
        </div>
      )}

      {push.state === "on" && (
        <>
          <div style={{ fontSize: 13.5, color: "var(--accent)" }}>{s.enabled}</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              htmlFor="reminder-hour"
              style={{ fontSize: 13, color: "var(--soft)" }}
            >
              {s.reminder}
            </label>
            <select
              id="reminder-hour"
              value={push.reminderHour ?? ""}
              onChange={(e) =>
                push.setReminderHour(
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
              style={{
                appearance: "none",
                width: "100%",
                boxSizing: "border-box",
                background: "rgba(255,255,255,.05)",
                border: "1px solid rgba(255,255,255,.1)",
                borderRadius: 12,
                padding: "11px 13px",
                color: "var(--body)",
                fontSize: 15,
                fontFamily: "inherit",
              }}
            >
              <option value="">{s.reminderOff}</option>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {formatHour(h, lang)}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 11.5, color: "var(--dim-3)" }}>
              {s.reminderHint}
            </span>
          </div>

          <button
            type="button"
            onClick={() => push.disable()}
            disabled={push.busy}
            style={{
              ...button(push.busy),
              color: push.busy ? "var(--dim-3)" : "var(--dim)",
              border: "1px solid rgba(255,255,255,.12)",
              background: "rgba(255,255,255,.04)",
            }}
          >
            {push.busy ? s.working : s.disable}
          </button>
        </>
      )}
    </div>
  );
}
