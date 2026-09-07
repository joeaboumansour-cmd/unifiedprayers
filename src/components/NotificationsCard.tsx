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
    blurb: "رسالة في الصباح، تذكير يومي، ورسائل نادرة من التطبيق.",
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
    morning: "رسالة الصباح",
    morningOff: "بدون رسالة",
    morningHint: "كلمة تشجيع كل صباح، وذكرٌ لسلسلة أيامك إن كانت لديك.",
  },
  en: {
    title: "Notifications",
    blurb: "A morning message, a daily reminder, and the occasional word from the app.",
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
    morning: "Morning message",
    morningOff: "No message",
    morningHint: "A word of encouragement each morning, and your streak when you have one.",
  },
} as const;

const card: CSSProperties = {
  borderRadius: 18,
  background: "rgb(var(--veil-rgb) / .045)",
  border: "1px solid rgb(var(--veil-rgb) / .07)",
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const button = (disabled: boolean): CSSProperties => ({
  appearance: "none",
  border: `1px solid ${disabled ? "rgb(var(--veil-rgb) / .08)" : "rgb(var(--accent-rgb) / .35)"}`,
  borderRadius: 999,
  padding: "11px 18px",
  fontSize: 14,
  fontWeight: 500,
  color: disabled ? "var(--dim-3)" : "var(--accent-ink)",
  background: disabled ? "rgb(var(--veil-rgb) / .03)" : "rgb(var(--accent-rgb) / .12)",
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

/**
 * One labelled hour, or off.
 *
 * Two of these now sit in the card — the morning message and the nightly
 * reminder — and they differ only in their words. Written once so they cannot
 * drift apart visually, which on a settings screen reads as two unrelated
 * controls rather than two of the same thing.
 */
function HourPicker({
  id,
  lang,
  label,
  off,
  hint,
  value,
  onChange,
}: {
  id: string;
  lang: Lang;
  label: string;
  off: string;
  hint: string;
  value: number | null;
  onChange: (hour: number | null) => void | Promise<void>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label htmlFor={id} style={{ fontSize: 13, color: "var(--soft)" }}>
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
        style={{
          appearance: "none",
          width: "100%",
          boxSizing: "border-box",
          background: "rgb(var(--veil-rgb) / .05)",
          border: "1px solid rgb(var(--veil-rgb) / .1)",
          borderRadius: 12,
          padding: "11px 13px",
          color: "var(--body)",
          fontSize: 15,
          fontFamily: "inherit",
        }}
      >
        <option value="">{off}</option>
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {formatHour(h, lang)}
          </option>
        ))}
      </select>
      <span style={{ fontSize: 11.5, color: "var(--dim-3)" }}>{hint}</span>
    </div>
  );
}

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
          <div style={{ fontSize: 13.5, color: "var(--accent-ink)" }}>{s.enabled}</div>

          <HourPicker
            id="morning-hour"
            lang={lang}
            label={s.morning}
            off={s.morningOff}
            hint={s.morningHint}
            value={push.morningHour}
            onChange={push.setMorningHour}
          />

          <HourPicker
            id="reminder-hour"
            lang={lang}
            label={s.reminder}
            off={s.reminderOff}
            hint={s.reminderHint}
            value={push.reminderHour}
            onChange={push.setReminderHour}
          />

          <button
            type="button"
            onClick={() => push.disable()}
            disabled={push.busy}
            style={{
              ...button(push.busy),
              color: push.busy ? "var(--dim-3)" : "var(--dim)",
              border: "1px solid rgb(var(--veil-rgb) / .12)",
              background: "rgb(var(--veil-rgb) / .04)",
            }}
          >
            {push.busy ? s.working : s.disable}
          </button>
        </>
      )}
    </div>
  );
}
