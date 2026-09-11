"use client";

import type { CSSProperties } from "react";

import topicsDoc from "@/data/verses/topics.json";
import type { Lang } from "@/lib/content";
import type { Push } from "@/lib/usePush";

type Group = { id: string; en: string; ar: string };
type Topic = { id: string; group: string; en: string; ar: string };

const GROUPS = (topicsDoc as { groups: Group[] }).groups;
const TOPICS = (topicsDoc as { topics: Topic[] }).topics;
const ALL = TOPICS.map((t) => t.id);

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
    blurb: "آية كل صباح، تذكير يومي، ورسائل نادرة من التطبيق.",
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
    morning: "آية اليوم",
    morningOff: "بدون آية",
    morningHint: "آية من الكتاب المقدس كل صباح، بلغة التطبيق، من المواضيع التي تختارها أدناه.",
    topics: "مواضيع الآيات",
    topicsAll: "كل المواضيع",
    topicsSome: (n: number, of: number) => `${n} من ${of}`,
    selectAll: "اختر الكل",
    clear: "امسح",
    topicsHint: "تتناوب الآيات بين المواضيع التي تختارها، موضوع كل يوم.",
    topicsNone: "لم تختر أي موضوع، لذا ستأتي الآيات من كل المواضيع.",
  },
  en: {
    title: "Notifications",
    blurb: "A verse each morning, a daily reminder, and the occasional word from the app.",
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
    morning: "Daily verse",
    morningOff: "No verse",
    morningHint: "A verse of scripture each morning, in the app's language, from the topics you pick below.",
    topics: "Verse topics",
    topicsAll: "All topics",
    topicsSome: (n: number, of: number) => `${n} of ${of}`,
    selectAll: "Select all",
    clear: "Clear",
    topicsHint: "The verses take turns between the topics you pick — one topic a day.",
    topicsNone: "Nothing picked, so the verses will come from every topic.",
  },
} as const;

/** A small tick for a chosen topic. */
function Check() {
  return (
    <svg viewBox="0 0 16 16" width={11} height={11} aria-hidden="true" style={{ flex: "none" }}>
      <path d="M3.5 8.4 6.6 11.3 12.5 4.8" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * What the daily verse is chosen from.
 *
 * Checkboxes, not a single choice: somebody can be fighting envy and grieving
 * at once, and the verses take turns between whatever is ticked. Grouped by
 * the three questions the list really asks — what you struggle with, what you
 * want to grow in, where you are — so forty topics read as three short lists.
 *
 * Null from the server means all, and draws as everything ticked.
 */
function TopicPicker({
  lang,
  value,
  onChange,
}: {
  lang: Lang;
  value: string[] | null;
  onChange: (topics: string[] | null) => void;
}) {
  const s = S[lang];
  const chosen = new Set(value ?? ALL);
  const count = chosen.size;

  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // Every topic ticked is stored as null — "all" — so topics added to the
    // list later reach this reader too, instead of a frozen list of today's.
    onChange(next.size === ALL.length ? null : ALL.filter((t) => next.has(t)));
  };

  const small: CSSProperties = {
    appearance: "none",
    border: "none",
    background: "none",
    padding: "2px 0",
    fontSize: 12.5,
    fontFamily: "inherit",
    color: "var(--accent-ink)",
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--soft)" }}>{s.topics}</div>
          <div style={{ fontSize: 11.5, color: "var(--dim-3)", marginTop: 2 }}>
            {count === ALL.length ? s.topicsAll : s.topicsSome(count, ALL.length)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <button type="button" style={small} onClick={() => onChange(null)} disabled={count === ALL.length}>
            {s.selectAll}
          </button>
          <button type="button" style={{ ...small, color: "var(--dim)" }} onClick={() => onChange([])} disabled={count === 0}>
            {s.clear}
          </button>
        </div>
      </div>

      {GROUPS.map((g) => (
        <fieldset key={g.id} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
          <legend
            style={{
              padding: 0,
              marginBottom: 8,
              fontSize: 10.5,
              fontWeight: 500,
              letterSpacing: ".1em",
              textTransform: "uppercase",
              color: "var(--dim-2)",
            }}
          >
            {g[lang]}
          </legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {TOPICS.filter((t) => t.group === g.id).map((t) => {
              const on = chosen.has(t.id);
              return (
                <label
                  key={t.id}
                  className="tap"
                  style={{
                    position: "relative",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 12px",
                    borderRadius: 999,
                    fontSize: 13,
                    cursor: "pointer",
                    color: on ? "var(--accent-ink)" : "var(--dim)",
                    background: on ? "rgb(var(--accent-rgb) / .13)" : "rgb(var(--veil-rgb) / .04)",
                    border: `1px solid ${on ? "rgb(var(--accent-rgb) / .38)" : "rgb(var(--veil-rgb) / .1)"}`,
                    transition: "background .2s ease, border-color .2s ease, color .2s ease",
                  }}
                >
                  {/* The real checkbox, for keyboards and screen readers; the
                      pill around it is only how it looks. */}
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(t.id)}
                    style={{ position: "absolute", opacity: 0, width: 1, height: 1, margin: 0 }}
                  />
                  {on && <Check />}
                  {t[lang]}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      <span style={{ fontSize: 11.5, color: "var(--dim-3)", lineHeight: 1.6 }}>
        {count === 0 ? s.topicsNone : s.topicsHint}
      </span>
    </div>
  );
}

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

          {/* Only while there is a verse to choose topics for. */}
          {push.morningHour !== null && (
            <TopicPicker lang={lang} value={push.verseTopics} onChange={push.setVerseTopics} />
          )}

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
