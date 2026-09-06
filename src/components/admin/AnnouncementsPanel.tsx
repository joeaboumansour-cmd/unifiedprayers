"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Bilingual,
  Button,
  Choice,
  Labelled,
  Switch,
  ToastLine,
  card,
  inputStyle,
  useToast,
} from "@/components/admin/AdminUI";
import type { Lang } from "@/lib/content";
import { getSupabase } from "@/lib/supabase/client";
import type { AnnouncementKind, AnnouncementRow, Audience } from "@/lib/supabase/types";

const S = {
  ar: {
    add: "رسالة جديدة",
    kind: "الشكل",
    banner: "شريط",
    modal: "نافذة",
    kindHint:
      "الشريط يظهر أعلى صفحة الصلوات. النافذة تظهر فوق التطبيق عند فتحه.",
    title: "العنوان",
    body: "النص",
    ctaLabel: "زر الإجراء",
    ctaUrl: "رابط الزر",
    ctaHint: "https:// فقط. اتركه فارغًا لرسالة بلا زر.",
    imageUrl: "رابط الصورة",
    audience: "لمن",
    all: "الجميع",
    signedIn: "المسجّلين",
    signedOut: "غير المسجّلين",
    from: "من",
    until: "حتى",
    windowHint: "اتركهما فارغين لتظهر فورًا وإلى أن توقفها.",
    dismissible: "يمكن إغلاقها",
    active: "مفعّلة",
    priority: "الأولوية",
    priorityHint: "الأعلى يظهر عند وجود أكثر من رسالة.",
    save: "حفظ",
    publish: "نشر",
    cancel: "إلغاء",
    edit: "تعديل",
    remove: "حذف",
    confirmRemove: "تأكيد الحذف",
    empty: "لا رسائل.",
    needTitle: "العنوان مطلوب بالعربية والإنجليزية.",
    needCta: "الزر يحتاج نصًا بالعربية والإنجليزية.",
    badUrl: "الرابط يجب أن يبدأ بـ https://",
    saved: "تم الحفظ.",
    removed: "تم الحذف.",
    failed: "تعذّر الحفظ.",
    live: "ظاهرة الآن",
    scheduled: "مجدولة",
    ended: "انتهت",
    off: "متوقفة",
    loading: "لحظة…",
  },
  en: {
    add: "New message",
    kind: "Shape",
    banner: "Banner",
    modal: "Modal",
    kindHint:
      "A banner sits at the top of the Prayers tab. A modal covers the app on open.",
    title: "Title",
    body: "Body",
    ctaLabel: "Button text",
    ctaUrl: "Button link",
    ctaHint: "https:// only. Leave empty for a message with no button.",
    imageUrl: "Image URL",
    audience: "Who sees it",
    all: "Everyone",
    signedIn: "Signed in",
    signedOut: "Signed out",
    from: "From",
    until: "Until",
    windowHint: "Leave both empty to show it now and until you switch it off.",
    dismissible: "Can be dismissed",
    active: "Active",
    priority: "Priority",
    priorityHint: "The highest wins when more than one is live.",
    save: "Save",
    publish: "Publish",
    cancel: "Cancel",
    edit: "Edit",
    remove: "Delete",
    confirmRemove: "Confirm delete",
    empty: "No messages.",
    needTitle: "A title is required in both Arabic and English.",
    needCta: "A button needs text in both Arabic and English.",
    badUrl: "The link must start with https://",
    saved: "Saved.",
    removed: "Deleted.",
    failed: "Could not save.",
    live: "Live now",
    scheduled: "Scheduled",
    ended: "Ended",
    off: "Off",
    loading: "One moment…",
  },
} as const;

type Draft = {
  id: string | null;
  kind: AnnouncementKind;
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  cta_label_ar: string;
  cta_label_en: string;
  cta_url: string;
  image_url: string;
  audience: Audience;
  starts_at: string;
  ends_at: string;
  dismissible: boolean;
  active: boolean;
  priority: number;
};

const blank = (): Draft => ({
  id: null,
  kind: "banner",
  title_ar: "",
  title_en: "",
  body_ar: "",
  body_en: "",
  cta_label_ar: "",
  cta_label_en: "",
  cta_url: "",
  image_url: "",
  audience: "all",
  starts_at: "",
  ends_at: "",
  dismissible: true,
  active: true,
  priority: 0,
});

/**
 * `datetime-local` speaks "YYYY-MM-DDTHH:mm" in the browser's own timezone and
 * the column is a timestamptz. These two convert between them, so a time typed
 * as 9pm means 9pm where the admin is sitting.
 */
const toLocalInput = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
};

const fromLocalInput = (v: string): string | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const toDraft = (r: AnnouncementRow): Draft => ({
  id: r.id,
  kind: r.kind,
  title_ar: r.title_ar,
  title_en: r.title_en,
  body_ar: r.body_ar ?? "",
  body_en: r.body_en ?? "",
  cta_label_ar: r.cta_label_ar ?? "",
  cta_label_en: r.cta_label_en ?? "",
  cta_url: r.cta_url ?? "",
  image_url: r.image_url ?? "",
  audience: r.audience,
  starts_at: toLocalInput(r.starts_at),
  ends_at: toLocalInput(r.ends_at),
  dismissible: r.dismissible,
  active: r.active,
  priority: r.priority,
});

/**
 * What an admin needs to know at a glance: is this on screen right now.
 *
 * Takes only the four words it uses rather than a whole language's copy — the
 * two halves of S are literal types and neither is assignable to the other.
 */
function statusOf(
  r: AnnouncementRow,
  s: { off: string; scheduled: string; ended: string; live: string },
): string {
  if (!r.active) return s.off;
  const now = Date.now();
  if (r.starts_at && Date.parse(r.starts_at) > now) return s.scheduled;
  if (r.ends_at && Date.parse(r.ends_at) <= now) return s.ended;
  return s.live;
}

export default function AnnouncementsPanel({ lang }: { lang: Lang }) {
  const s = S[lang];
  const ar = lang === "ar";

  const [rows, setRows] = useState<AnnouncementRow[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [toast, setToast] = useToast();

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    // The admin read policy lets this see inactive and scheduled rows, which
    // the same query from a reader would not return.
    const { data } = await supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setRows(data ?? []);
  }, []);

  useEffect(() => {
    load().catch(() => setRows([]));
  }, [load]);

  const save = async () => {
    if (!draft || saving) return;

    if (!draft.title_ar.trim() || !draft.title_en.trim()) {
      setToast({ tone: "bad", text: s.needTitle });
      return;
    }
    const url = draft.cta_url.trim();
    const image = draft.image_url.trim();
    if ((url && !url.startsWith("https://")) || (image && !image.startsWith("https://"))) {
      setToast({ tone: "bad", text: s.badUrl });
      return;
    }
    // Mirrors the announcements_cta constraint. Catching it here means a
    // readable sentence instead of a Postgres constraint name.
    if (url && (!draft.cta_label_ar.trim() || !draft.cta_label_en.trim())) {
      setToast({ tone: "bad", text: s.needCta });
      return;
    }

    const supabase = getSupabase();
    if (!supabase) return;
    setSaving(true);

    const payload = {
      kind: draft.kind,
      title_ar: draft.title_ar.trim(),
      title_en: draft.title_en.trim(),
      body_ar: draft.body_ar.trim() || null,
      body_en: draft.body_en.trim() || null,
      cta_label_ar: url ? draft.cta_label_ar.trim() : null,
      cta_label_en: url ? draft.cta_label_en.trim() : null,
      cta_url: url || null,
      image_url: image || null,
      audience: draft.audience,
      starts_at: fromLocalInput(draft.starts_at),
      ends_at: fromLocalInput(draft.ends_at),
      dismissible: draft.dismissible,
      active: draft.active,
      priority: draft.priority,
    };

    const { error } = draft.id
      ? await supabase.from("announcements").update(payload).eq("id", draft.id)
      : await supabase.from("announcements").insert(payload);

    setSaving(false);
    if (error) {
      setToast({ tone: "bad", text: s.failed });
      return;
    }
    setToast({ tone: "ok", text: s.saved });
    setDraft(null);
    await load().catch(() => {});
  };

  const remove = async (id: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    setConfirming(null);
    if (error) {
      setToast({ tone: "bad", text: s.failed });
      return;
    }
    setToast({ tone: "ok", text: s.removed });
    await load().catch(() => {});
  };

  /** Switching a message off is one tap, and the one that has to be fast. */
  const toggleActive = async (r: AnnouncementRow) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase
      .from("announcements")
      .update({ active: !r.active })
      .eq("id", r.id);
    if (error) {
      setToast({ tone: "bad", text: s.failed });
      return;
    }
    await load().catch(() => {});
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <ToastLine toast={toast} />

      {!draft && (
        <Button wide onClick={() => setDraft(blank())}>
          {s.add}
        </Button>
      )}

      {draft && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
          <Labelled label={s.kind} hint={s.kindHint}>
            <Choice<AnnouncementKind>
              value={draft.kind}
              onChange={(kind) => setDraft({ ...draft, kind })}
              options={[
                { id: "banner", label: s.banner },
                { id: "modal", label: s.modal },
              ]}
            />
          </Labelled>

          <Bilingual
            label={s.title}
            ar={draft.title_ar}
            en={draft.title_en}
            rows={1}
            onAr={(v) => setDraft({ ...draft, title_ar: v })}
            onEn={(v) => setDraft({ ...draft, title_en: v })}
          />
          <Bilingual
            label={s.body}
            ar={draft.body_ar}
            en={draft.body_en}
            rows={3}
            onAr={(v) => setDraft({ ...draft, body_ar: v })}
            onEn={(v) => setDraft({ ...draft, body_en: v })}
          />

          <Labelled label={s.ctaUrl} hint={s.ctaHint}>
            <input
              type="url"
              dir="ltr"
              inputMode="url"
              placeholder="https://"
              value={draft.cta_url}
              onChange={(e) => setDraft({ ...draft, cta_url: e.target.value })}
              style={inputStyle()}
            />
          </Labelled>
          {/* Only asked for once there is somewhere for the button to go. */}
          {draft.cta_url.trim() !== "" && (
            <Bilingual
              label={s.ctaLabel}
              ar={draft.cta_label_ar}
              en={draft.cta_label_en}
              rows={1}
              onAr={(v) => setDraft({ ...draft, cta_label_ar: v })}
              onEn={(v) => setDraft({ ...draft, cta_label_en: v })}
            />
          )}

          <Labelled label={s.imageUrl}>
            <input
              type="url"
              dir="ltr"
              inputMode="url"
              placeholder="https://"
              value={draft.image_url}
              onChange={(e) => setDraft({ ...draft, image_url: e.target.value })}
              style={inputStyle()}
            />
          </Labelled>

          <Labelled label={s.audience}>
            <Choice<Audience>
              value={draft.audience}
              onChange={(audience) => setDraft({ ...draft, audience })}
              options={[
                { id: "all", label: s.all },
                { id: "signed_in", label: s.signedIn },
                { id: "signed_out", label: s.signedOut },
              ]}
            />
          </Labelled>

          <Labelled label={`${s.from} — ${s.until}`} hint={s.windowHint}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                type="datetime-local"
                dir="ltr"
                value={draft.starts_at}
                aria-label={s.from}
                onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })}
                style={inputStyle()}
              />
              <input
                type="datetime-local"
                dir="ltr"
                value={draft.ends_at}
                aria-label={s.until}
                onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })}
                style={inputStyle()}
              />
            </div>
          </Labelled>

          <Labelled label={s.priority} hint={s.priorityHint}>
            <input
              type="number"
              dir="ltr"
              value={draft.priority}
              onChange={(e) =>
                setDraft({ ...draft, priority: Number(e.target.value) || 0 })
              }
              style={inputStyle()}
            />
          </Labelled>

          <Switch
            on={draft.dismissible}
            label={s.dismissible}
            onToggle={() => setDraft({ ...draft, dismissible: !draft.dismissible })}
          />
          <Switch
            on={draft.active}
            label={s.active}
            onToggle={() => setDraft({ ...draft, active: !draft.active })}
          />

          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={save} disabled={saving}>
              {saving ? s.loading : draft.id ? s.save : s.publish}
            </Button>
            <Button tone="quiet" onClick={() => setDraft(null)}>
              {s.cancel}
            </Button>
          </div>
        </div>
      )}

      {rows?.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--dim)" }}>{s.empty}</div>
      )}

      {rows?.map((r) => (
        <div key={r.id} style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 11.5,
              color: "var(--dim-2)",
            }}
          >
            <span>{r.kind === "modal" ? s.modal : s.banner}</span>
            <span aria-hidden="true">·</span>
            <span>{statusOf(r, s)}</span>
          </div>
          <div
            style={{ fontSize: 15, fontWeight: 500, color: r.active ? "var(--body)" : "var(--dim)" }}
            dir={ar ? "rtl" : "ltr"}
          >
            {ar ? r.title_ar : r.title_en}
          </div>
          {(ar ? r.body_ar : r.body_en) && (
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--dim)" }} dir={ar ? "rtl" : "ltr"}>
              {ar ? r.body_ar : r.body_en}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button tone="quiet" onClick={() => toggleActive(r)}>
              {r.active ? s.off : s.active}
            </Button>
            <Button tone="quiet" onClick={() => setDraft(toDraft(r))}>
              {s.edit}
            </Button>
            <Button
              tone="danger"
              onClick={() => (confirming === r.id ? remove(r.id) : setConfirming(r.id))}
            >
              {confirming === r.id ? s.confirmRemove : s.remove}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
