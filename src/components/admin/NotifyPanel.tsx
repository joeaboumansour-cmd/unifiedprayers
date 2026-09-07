"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Bilingual,
  Button,
  Choice,
  Labelled,
  ToastLine,
  adminFetch,
  card,
  inputStyle,
  useToast,
} from "@/components/admin/AdminUI";
import type { Lang } from "@/lib/content";
import { getSupabase } from "@/lib/supabase/client";
import type { DailyReminderSetting, NotificationRow } from "@/lib/supabase/types";

const S = {
  ar: {
    devices: "أجهزة مشتركة",
    signedIn: "منها مرتبطة بحساب",
    notConfigured:
      "الإشعارات غير مهيّأة على الخادم. أضف مفاتيح VAPID ثم أعد النشر.",
    compose: "رسالة جديدة",
    title: "العنوان",
    body: "النص",
    url: "الوجهة عند الضغط",
    urlHint: "مسار داخل التطبيق مثل / أو رابط https://",
    to: "إلى",
    everyone: "الجميع",
    oneUser: "مستخدم واحد",
    username: "اسم المستخدم",
    usernameHint: "بلا @. يصل إلى كل أجهزة هذا الحساب.",
    userNotFound: "لا حساب بهذا الاسم.",
    when: "التوقيت",
    now: "الآن",
    later: "لاحقًا",
    at: "التاريخ والوقت",
    send: "إرسال",
    schedule: "جدولة",
    sending: "جارٍ الإرسال…",
    needTitle: "العنوان مطلوب بالعربية والإنجليزية.",
    needUser: "اكتب اسم المستخدم.",
    sent: (n: number) => `تم الإرسال إلى ${n} جهاز.`,
    scheduled: "تمت الجدولة.",
    noDevices: "لا أجهزة مشتركة بعد.",
    failed: "تعذّر الإرسال.",
    history: "السجل",
    cancel: "إلغاء الجدولة",
    canceled: "أُلغيت.",
    empty: "لا شيء بعد.",
    reminder: "التذكير اليومي",
    reminderHint:
      "النص الذي يصل كل مساء لمن فعّل التذكير. التوقيت يختاره كل شخص من إعداداته.",
    saveReminder: "حفظ النص",
    saved: "تم الحفظ.",
    status: {
      draft: "مسودة",
      scheduled: "مجدولة",
      sending: "جارٍ الإرسال",
      sent: "أُرسلت",
      failed: "فشلت",
      canceled: "أُلغيت",
    },
  },
  en: {
    devices: "subscribed devices",
    signedIn: "linked to an account",
    notConfigured:
      "Push is not configured on the server. Add the VAPID keys and redeploy.",
    compose: "New notification",
    title: "Title",
    body: "Body",
    url: "Where tapping it goes",
    urlHint: "A path inside the app such as / or an https:// link",
    to: "To",
    everyone: "Everyone",
    oneUser: "One person",
    username: "Username",
    usernameHint: "No @. Reaches every device on that account.",
    userNotFound: "No account with that username.",
    when: "When",
    now: "Now",
    later: "Later",
    at: "Date and time",
    send: "Send",
    schedule: "Schedule",
    sending: "Sending…",
    needTitle: "A title is required in both Arabic and English.",
    needUser: "Enter a username.",
    sent: (n: number) => `Sent to ${n} device${n === 1 ? "" : "s"}.`,
    scheduled: "Scheduled.",
    noDevices: "No devices are subscribed yet.",
    failed: "Could not send.",
    history: "History",
    cancel: "Cancel",
    canceled: "Cancelled.",
    empty: "Nothing yet.",
    reminder: "Daily reminder",
    reminderHint:
      "What goes out each evening to everyone who switched reminders on. Each person picks their own hour in Settings.",
    saveReminder: "Save text",
    saved: "Saved.",
    status: {
      draft: "Draft",
      scheduled: "Scheduled",
      sending: "Sending",
      sent: "Sent",
      failed: "Failed",
      canceled: "Cancelled",
    },
  },
} as const;

const FALLBACK: DailyReminderSetting = {
  title_ar: "وقت الصلاة",
  title_en: "Time to pray",
  body_ar: "خذ لحظة مع الروح القدس.",
  body_en: "Take a moment with the Holy Spirit.",
  url: "/",
};

export default function NotifyPanel({ lang }: { lang: Lang }) {
  const s = S[lang];
  const ar = lang === "ar";

  const [stats, setStats] = useState<{
    devices: number;
    signedIn: number;
    pushConfigured: boolean;
  } | null>(null);
  const [history, setHistory] = useState<NotificationRow[]>([]);
  const [toast, setToast] = useToast();

  /* ------------------------------- compose ------------------------------- */
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [bodyAr, setBodyAr] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [url, setUrl] = useState("/");
  const [to, setTo] = useState<"all" | "user">("all");
  const [username, setUsername] = useState("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState("");
  const [sending, setSending] = useState(false);

  /* ------------------------------- reminder ------------------------------ */
  const [reminder, setReminder] = useState<DailyReminderSetting>(FALLBACK);
  const [savingReminder, setSavingReminder] = useState(false);

  const loadHistory = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(25);
    setHistory(data ?? []);
  }, []);

  useEffect(() => {
    adminFetch("/api/admin/notify")
      .then(({ ok, data }) => {
        if (ok) {
          setStats({
            devices: Number(data.devices) || 0,
            signedIn: Number(data.signedIn) || 0,
            pushConfigured: Boolean(data.pushConfigured),
          });
        }
      })
      .catch(() => {});

    loadHistory().catch(() => {});

    const supabase = getSupabase();
    supabase
      ?.from("app_settings")
      .select("value")
      .eq("key", "daily_reminder")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          setReminder({ ...FALLBACK, ...(data.value as Partial<DailyReminderSetting>) });
        }
      });
  }, [loadHistory]);

  /** Turns the typed username into the id the send route targets. */
  const resolveUser = async (): Promise<string | null> => {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username.trim().toLowerCase())
      .maybeSingle();
    return data?.id ?? null;
  };

  const send = async () => {
    if (sending) return;
    if (!titleAr.trim() || !titleEn.trim()) {
      setToast({ tone: "bad", text: s.needTitle });
      return;
    }
    if (to === "user" && !username.trim()) {
      setToast({ tone: "bad", text: s.needUser });
      return;
    }

    setSending(true);
    try {
      let target: string | null = null;
      if (to === "user") {
        target = await resolveUser();
        if (!target) {
          setToast({ tone: "bad", text: s.userNotFound });
          return;
        }
      }

      const { ok, data } = await adminFetch("/api/admin/notify", {
        method: "POST",
        body: {
          title_ar: titleAr.trim(),
          title_en: titleEn.trim(),
          body_ar: bodyAr.trim() || null,
          body_en: bodyEn.trim() || null,
          url: url.trim() || "/",
          audience: to,
          target_user_id: target,
          // The route treats a time under a minute away as "now", so switching
          // back to Now does not have to clear the field to take effect.
          scheduled_at: when === "later" && at ? new Date(at).toISOString() : null,
        },
      });

      if (!ok) {
        setToast({
          tone: "bad",
          text: data.error === "vapid-not-configured" ? s.notConfigured : s.failed,
        });
        return;
      }

      if (data.status === "scheduled") {
        setToast({ tone: "ok", text: s.scheduled });
      } else {
        const n = Number(data.sent) || 0;
        setToast(
          n === 0
            ? { tone: "bad", text: s.noDevices }
            : { tone: "ok", text: s.sent(n) },
        );
      }

      // The composed text is kept: a send that reached nobody is usually
      // retyped, and clearing it would be the app deciding that for them.
      await loadHistory().catch(() => {});
    } catch {
      setToast({ tone: "bad", text: s.failed });
    } finally {
      setSending(false);
    }
  };

  const cancel = async (id: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    // The only write the app makes to this table directly. The policy in 0004
    // allows it for scheduled rows and nothing else.
    const { error } = await supabase
      .from("notifications")
      .update({ status: "canceled" })
      .eq("id", id)
      .eq("status", "scheduled");
    if (error) {
      setToast({ tone: "bad", text: s.failed });
      return;
    }
    setToast({ tone: "ok", text: s.canceled });
    await loadHistory().catch(() => {});
  };

  const saveReminder = async () => {
    const supabase = getSupabase();
    if (!supabase || savingReminder) return;
    setSavingReminder(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "daily_reminder", value: reminder }, { onConflict: "key" });
    setSavingReminder(false);
    setToast(
      error ? { tone: "bad", text: s.failed } : { tone: "ok", text: s.saved },
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <ToastLine toast={toast} />

      {stats && !stats.pushConfigured && (
        <div style={{ fontSize: 13, color: "#f2a2b0", lineHeight: 1.7 }}>
          {s.notConfigured}
        </div>
      )}

      {stats && (
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { n: stats.devices, label: s.devices },
            { n: stats.signedIn, label: s.signedIn },
          ].map((x) => (
            <div key={x.label} style={{ ...card, flex: 1, padding: 14 }}>
              <div style={{ fontSize: 24, fontWeight: 600, color: "var(--accent-ink)" }}>
                {x.n}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--dim-2)", lineHeight: 1.5 }}>
                {x.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------ compose ----------------------------- */}
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{s.compose}</div>

        <Bilingual
          label={s.title}
          ar={titleAr}
          en={titleEn}
          rows={1}
          onAr={setTitleAr}
          onEn={setTitleEn}
        />
        <Bilingual
          label={s.body}
          ar={bodyAr}
          en={bodyEn}
          rows={2}
          onAr={setBodyAr}
          onEn={setBodyEn}
        />

        <Labelled label={s.url} hint={s.urlHint}>
          <input
            type="text"
            dir="ltr"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={inputStyle()}
          />
        </Labelled>

        <Labelled label={s.to}>
          <Choice<"all" | "user">
            value={to}
            onChange={setTo}
            options={[
              { id: "all", label: s.everyone },
              { id: "user", label: s.oneUser },
            ]}
          />
        </Labelled>

        {to === "user" && (
          <Labelled label={s.username} hint={s.usernameHint}>
            <input
              type="text"
              dir="ltr"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={inputStyle()}
            />
          </Labelled>
        )}

        <Labelled label={s.when}>
          <Choice<"now" | "later">
            value={when}
            onChange={setWhen}
            options={[
              { id: "now", label: s.now },
              { id: "later", label: s.later },
            ]}
          />
        </Labelled>

        {when === "later" && (
          <Labelled label={s.at}>
            <input
              type="datetime-local"
              dir="ltr"
              value={at}
              onChange={(e) => setAt(e.target.value)}
              style={inputStyle()}
            />
          </Labelled>
        )}

        <Button wide onClick={send} disabled={sending}>
          {sending ? s.sending : when === "later" ? s.schedule : s.send}
        </Button>
      </div>

      {/* ------------------------- the daily reminder ----------------------- */}
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{s.reminder}</div>
        <div style={{ fontSize: 12, color: "var(--dim-2)", lineHeight: 1.7 }}>
          {s.reminderHint}
        </div>
        <Bilingual
          label={s.title}
          ar={reminder.title_ar}
          en={reminder.title_en}
          rows={1}
          onAr={(v) => setReminder({ ...reminder, title_ar: v })}
          onEn={(v) => setReminder({ ...reminder, title_en: v })}
        />
        <Bilingual
          label={s.body}
          ar={reminder.body_ar}
          en={reminder.body_en}
          rows={2}
          onAr={(v) => setReminder({ ...reminder, body_ar: v })}
          onEn={(v) => setReminder({ ...reminder, body_en: v })}
        />
        <Button onClick={saveReminder} disabled={savingReminder}>
          {s.saveReminder}
        </Button>
      </div>

      {/* -------------------------------- log ------------------------------- */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
          {s.history}
        </div>
        {history.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--dim)" }}>{s.empty}</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {history.map((n) => (
            <div key={n.id} style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  fontSize: 11.5,
                  color: n.status === "failed" ? "#f2a2b0" : "var(--dim-2)",
                }}
              >
                <span>{s.status[n.status]}</span>
                {n.status === "sent" && (
                  <span dir="ltr">
                    {n.sent_count}
                    {n.failed_count > 0 ? ` (+${n.failed_count})` : ""}
                  </span>
                )}
                {n.scheduled_at && n.status === "scheduled" && (
                  <span dir="ltr">
                    {new Date(n.scheduled_at).toLocaleString(ar ? "ar" : "en")}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 14, fontWeight: 500 }} dir={ar ? "rtl" : "ltr"}>
                {ar ? n.title_ar : n.title_en}
              </div>
              {n.status === "scheduled" && (
                <div style={{ marginTop: 4 }}>
                  <Button tone="quiet" onClick={() => cancel(n.id)}>
                    {s.cancel}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
