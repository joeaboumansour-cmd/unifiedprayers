"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Bilingual,
  Button,
  Labelled,
  Switch,
  ToastLine,
  card,
  inputStyle,
  useToast,
} from "@/components/admin/AdminUI";
import type { Lang } from "@/lib/content";
import { getSupabase } from "@/lib/supabase/client";
import type { VerseRow } from "@/lib/supabase/types";

const S = {
  ar: {
    add: "أضف آية",
    textLabel: "نص الآية",
    refLabel: "المرجع",
    refHint: "مثل: يوحنا ١٤:٢٦",
    dateLabel: "تاريخ محدد",
    dateHint: "اتركه فارغًا لتدخل الآية في التناوب اليومي.",
    active: "مفعّلة",
    save: "حفظ",
    publish: "نشر",
    cancel: "إلغاء",
    edit: "تعديل",
    remove: "حذف",
    confirmRemove: "تأكيد الحذف",
    empty: "لا آيات بعد. الآية المضمّنة في التطبيق هي المعروضة الآن.",
    pinned: "مثبّتة",
    rotating: "في التناوب",
    off: "متوقفة",
    needText: "النصان العربي والإنجليزي مطلوبان.",
    saved: "تم الحفظ.",
    removed: "تم الحذف.",
    failed: "تعذّر الحفظ. تحقق من الاتصال.",
    loading: "لحظة…",
    countOne: "آية واحدة",
    count: (n: number) => `${n} آية`,
  },
  en: {
    add: "Add a verse",
    textLabel: "Verse text",
    refLabel: "Reference",
    refHint: "For example: John 14:26",
    dateLabel: "Pin to a date",
    dateHint: "Leave empty to put the verse into the daily rotation.",
    active: "Active",
    save: "Save",
    publish: "Publish",
    cancel: "Cancel",
    edit: "Edit",
    remove: "Delete",
    confirmRemove: "Confirm delete",
    empty: "No verses yet. The one bundled with the app is showing.",
    pinned: "Pinned",
    rotating: "In rotation",
    off: "Off",
    needText: "Both the Arabic and English text are required.",
    saved: "Saved.",
    removed: "Deleted.",
    failed: "Could not save. Check your connection.",
    loading: "One moment…",
    countOne: "1 verse",
    count: (n: number) => `${n} verses`,
  },
} as const;

type Draft = {
  id: string | null;
  text_ar: string;
  text_en: string;
  ref_ar: string;
  ref_en: string;
  show_on: string;
  active: boolean;
};

const blank = (): Draft => ({
  id: null,
  text_ar: "",
  text_en: "",
  ref_ar: "",
  ref_en: "",
  show_on: "",
  active: true,
});

const toDraft = (r: VerseRow): Draft => ({
  id: r.id,
  text_ar: r.text_ar,
  text_en: r.text_en,
  ref_ar: r.ref_ar ?? "",
  ref_en: r.ref_en ?? "",
  show_on: r.show_on ?? "",
  active: r.active,
});

/**
 * The verse list.
 *
 * Reads and writes go straight to PostgREST rather than through a route
 * handler: `verses` has real policies — public read of the active rows, admin
 * everything — so the database is already enforcing exactly what a route would
 * have to re-implement. The push tables are the opposite case, and that is why
 * they have routes and this does not.
 */
export default function VersesPanel({ lang }: { lang: Lang }) {
  const s = S[lang];
  const ar = lang === "ar";

  const [rows, setRows] = useState<VerseRow[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [toast, setToast] = useToast();

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = await supabase
      .from("verses")
      // Pinned dates first and newest first within them, so the next few days
      // are at the top where they are being edited.
      .select("*")
      .order("show_on", { ascending: true, nullsFirst: false })
      .order("sort", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(200);
    setRows(data ?? []);
  }, []);

  useEffect(() => {
    load().catch(() => setRows([]));
  }, [load]);

  const save = async () => {
    if (!draft || saving) return;
    if (!draft.text_ar.trim() || !draft.text_en.trim()) {
      setToast({ tone: "bad", text: s.needText });
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;

    setSaving(true);
    const payload = {
      text_ar: draft.text_ar.trim(),
      text_en: draft.text_en.trim(),
      ref_ar: draft.ref_ar.trim() || null,
      ref_en: draft.ref_en.trim() || null,
      show_on: draft.show_on || null,
      active: draft.active,
    };

    const { error } = draft.id
      ? await supabase.from("verses").update(payload).eq("id", draft.id)
      : await supabase.from("verses").insert(payload);

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
    const { error } = await supabase.from("verses").delete().eq("id", id);
    setConfirming(null);
    if (error) {
      setToast({ tone: "bad", text: s.failed });
      return;
    }
    setToast({ tone: "ok", text: s.removed });
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
          <Bilingual
            label={s.textLabel}
            ar={draft.text_ar}
            en={draft.text_en}
            rows={3}
            onAr={(v) => setDraft({ ...draft, text_ar: v })}
            onEn={(v) => setDraft({ ...draft, text_en: v })}
          />
          <Bilingual
            label={s.refLabel}
            ar={draft.ref_ar}
            en={draft.ref_en}
            rows={1}
            arPlaceholder="يوحنا ١٤:٢٦"
            enPlaceholder="John 14:26"
            onAr={(v) => setDraft({ ...draft, ref_ar: v })}
            onEn={(v) => setDraft({ ...draft, ref_en: v })}
          />
          <Labelled label={s.dateLabel} hint={s.dateHint}>
            <input
              type="date"
              value={draft.show_on}
              dir="ltr"
              onChange={(e) => setDraft({ ...draft, show_on: e.target.value })}
              style={inputStyle()}
            />
          </Labelled>
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
        <div style={{ fontSize: 13, color: "var(--dim)", lineHeight: 1.7 }}>
          {s.empty}
        </div>
      )}

      {rows?.map((r) => {
        const badge = !r.active ? s.off : r.show_on ? s.pinned : s.rotating;
        return (
          <div key={r.id} style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11.5,
                color: r.active ? "var(--dim-2)" : "var(--dim-3)",
              }}
            >
              <span>{badge}</span>
              {r.show_on && <span dir="ltr">{r.show_on}</span>}
            </div>
            <div
              style={{
                fontSize: 14.5,
                lineHeight: 1.8,
                color: r.active ? "var(--body)" : "var(--dim)",
              }}
              dir={ar ? "rtl" : "ltr"}
            >
              {ar ? r.text_ar : r.text_en}
            </div>
            {(ar ? r.ref_ar : r.ref_en) && (
              <div style={{ fontSize: 12, color: "var(--dim)" }}>
                {ar ? r.ref_ar : r.ref_en}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <Button tone="quiet" onClick={() => setDraft(toDraft(r))}>
                {s.edit}
              </Button>
              {/* Two taps to delete. A verse is a few lines someone typed by
                  hand and there is no undo behind this button. */}
              <Button
                tone="danger"
                onClick={() =>
                  confirming === r.id ? remove(r.id) : setConfirming(r.id)
                }
              >
                {confirming === r.id ? s.confirmRemove : s.remove}
              </Button>
            </div>
          </div>
        );
      })}

      {rows && rows.length > 0 && (
        <div style={{ fontSize: 11.5, color: "var(--dim-3)" }}>
          {rows.length === 1 ? s.countOne : s.count(rows.length)}
        </div>
      )}
    </div>
  );
}
