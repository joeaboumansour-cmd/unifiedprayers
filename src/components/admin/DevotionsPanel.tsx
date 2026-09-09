"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Button,
  Choice,
  Labelled,
  Switch,
  TextArea,
  ToastLine,
  card,
  inputStyle,
  useToast,
} from "@/components/admin/AdminUI";
import type { Lang } from "@/lib/content";
import { getSupabase } from "@/lib/supabase/client";
import type { DevotionRow, DevotionTrack } from "@/lib/supabase/types";

/**
 * The daily devotions.
 *
 * This panel is shaped around one job done 732 times: someone is holding an
 * open book and typing what is on the page. So —
 *
 *   - the day is a date picker whose year is thrown away, because picking "8
 *     September" off a calendar is faster and less wrong than two number
 *     fields;
 *   - the paragraphs are one textarea split on blank lines, because that is
 *     what pasting or typing a page produces, and the count is echoed back so
 *     the split is never a guess;
 *   - English is folded away behind a disclosure. The books are Arabic, an
 *     English page may never be typed, and a form that shows twelve fields
 *     when eight are wanted is a form that gets abandoned halfway.
 *
 * Reads and writes go straight to PostgREST, like the verses panel and for the
 * same reason: `daily_devotions` has real policies, so a route handler here
 * would only be re-implementing what the database already enforces.
 */

const S = {
  ar: {
    add: "أضف تأمّلاً",
    track: "الكتاب",
    individual: "للفرد",
    couples: "للزوجين",
    date: "اليوم",
    dateHint: "السنة لا تُحفظ. الصفحة تظهر في هذا اليوم من كل سنة.",
    title: "العنوان",
    verse: "الآية",
    verseRef: "المرجع",
    body: "الفقرات",
    bodyHint: "افصل بين الفقرات بسطر فارغ.",
    quote: "الاقتباس الختامي",
    quoteSource: "قائل الاقتباس",
    english: "أضف الترجمة الإنجليزية",
    englishHint: "اختياري. ما يُترك فارغًا يُعرض بالعربية.",
    active: "مفعّل",
    save: "حفظ",
    publish: "نشر",
    cancel: "إلغاء",
    edit: "تعديل",
    remove: "حذف",
    confirmRemove: "تأكيد الحذف",
    filterAll: "الكل",
    empty: "لا تأمّلات بعد.",
    off: "متوقف",
    taken: "هذا اليوم مُسجَّل في هذا الكتاب. الحفظ سيُنشئ نسخة ثانية — عدّل الموجود بدلاً من ذلك.",
    needAll: "العنوان والآية وفقرة واحدة على الأقل مطلوبة.",
    needDate: "اختر اليوم.",
    saved: "تم الحفظ.",
    removed: "تم الحذف.",
    duplicate: "هذا اليوم مُسجَّل في هذا الكتاب. عدّل الصفحة الموجودة.",
    failed: "تعذّر الحفظ. تحقق من الاتصال.",
    loading: "لحظة…",
    paragraphs: (n: number) => (n === 1 ? "فقرة واحدة" : `${n} فقرات`),
    filled: (n: number) => `${n} من ٣٦٦ يومًا`,
  },
  en: {
    add: "Add a devotion",
    track: "Book",
    individual: "For me",
    couples: "For us",
    date: "Day",
    dateHint: "The year is not stored. The page shows on this day every year.",
    title: "Title",
    verse: "Verse",
    verseRef: "Reference",
    body: "Paragraphs",
    bodyHint: "Separate paragraphs with a blank line.",
    quote: "Closing quote",
    quoteSource: "Attributed to",
    english: "Add the English translation",
    englishHint: "Optional. Anything left blank shows in Arabic.",
    active: "Active",
    save: "Save",
    publish: "Publish",
    cancel: "Cancel",
    edit: "Edit",
    remove: "Delete",
    confirmRemove: "Confirm delete",
    filterAll: "All",
    empty: "No devotions yet.",
    off: "Off",
    taken: "That day already has a page in this book. Saving would make a second one — edit the existing page instead.",
    needAll: "A title, a verse and at least one paragraph are required.",
    needDate: "Pick the day.",
    saved: "Saved.",
    removed: "Deleted.",
    duplicate: "That day already has a page in this book. Edit the existing one.",
    failed: "Could not save. Check your connection.",
    loading: "One moment…",
    paragraphs: (n: number) => (n === 1 ? "1 paragraph" : `${n} paragraphs`),
    filled: (n: number) => `${n} of 366 days`,
  },
} as const;

/**
 * The year the date field runs in. A leap year, so the 29th of February is
 * reachable; the value itself is dropped on save.
 */
const PICKER_YEAR = 2024;

type Draft = {
  id: string | null;
  track: DevotionTrack;
  /** YYYY-MM-DD in PICKER_YEAR. Only the month and day survive. */
  date: string;
  title_ar: string;
  verse_ar: string;
  verse_ref_ar: string;
  body_ar: string;
  quote_ar: string;
  quote_source_ar: string;
  title_en: string;
  verse_en: string;
  verse_ref_en: string;
  body_en: string;
  quote_en: string;
  quote_source_en: string;
  active: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");
const dateOf = (month: number, day: number) =>
  `${PICKER_YEAR}-${pad(month)}-${pad(day)}`;

/** Blank lines are paragraph breaks. Everything else is left alone. */
const toParagraphs = (raw: string): string[] =>
  raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

const blank = (): Draft => {
  const now = new Date();
  return {
    id: null,
    track: "individual",
    // Today, because the book is being copied a day at a time and today is
    // overwhelmingly the day being typed.
    date: dateOf(now.getMonth() + 1, now.getDate()),
    title_ar: "",
    verse_ar: "",
    verse_ref_ar: "",
    body_ar: "",
    quote_ar: "",
    quote_source_ar: "",
    title_en: "",
    verse_en: "",
    verse_ref_en: "",
    body_en: "",
    quote_en: "",
    quote_source_en: "",
    active: true,
  };
};

const toDraft = (r: DevotionRow): Draft => ({
  id: r.id,
  track: r.track,
  date: dateOf(r.month, r.day),
  title_ar: r.title_ar,
  verse_ar: r.verse_ar,
  verse_ref_ar: r.verse_ref_ar ?? "",
  body_ar: r.body_ar.join("\n\n"),
  quote_ar: r.quote_ar ?? "",
  quote_source_ar: r.quote_source_ar ?? "",
  title_en: r.title_en ?? "",
  verse_en: r.verse_en ?? "",
  verse_ref_en: r.verse_ref_en ?? "",
  body_en: (r.body_en ?? []).join("\n\n"),
  quote_en: r.quote_en ?? "",
  quote_source_en: r.quote_source_en ?? "",
  active: r.active,
});

export default function DevotionsPanel({ lang }: { lang: Lang }) {
  const s = S[lang];
  const ar = lang === "ar";

  const [rows, setRows] = useState<DevotionRow[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showEn, setShowEn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [filter, setFilter] = useState<DevotionTrack | "all">("all");
  const [toast, setToast] = useToast();

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = await supabase
      .from("daily_devotions")
      .select("*")
      .order("month", { ascending: true })
      .order("day", { ascending: true })
      .order("track", { ascending: true })
      // Twice 366 is the whole of both books, so this cannot truncate.
      .limit(800);
    setRows(data ?? []);
  }, []);

  useEffect(() => {
    load().catch(() => setRows([]));
  }, [load]);

  /** How a day reads on the page it came from, in the panel's language. */
  const dayLabel = useCallback(
    (month: number, day: number) =>
      new Intl.DateTimeFormat(ar ? "ar" : "en", {
        day: "numeric",
        month: "long",
      }).format(new Date(PICKER_YEAR, month - 1, day)),
    [ar],
  );

  const [dm, dd] = useMemo(() => {
    const parts = draft?.date?.split("-") ?? [];
    return [Number(parts[1]), Number(parts[2])];
  }, [draft?.date]);

  /* Warned about before the save rather than after it. The unique constraint
     would refuse this anyway, but "you are about to duplicate the 8th" is a
     more useful thing to know while the page is still being typed. */
  const clash =
    draft && !draft.id && dm && dd
      ? rows?.find((r) => r.track === draft.track && r.month === dm && r.day === dd)
      : undefined;

  const save = async () => {
    if (!draft || saving) return;
    if (!dm || !dd) {
      setToast({ tone: "bad", text: s.needDate });
      return;
    }
    const body = toParagraphs(draft.body_ar);
    if (!draft.title_ar.trim() || !draft.verse_ar.trim() || !body.length) {
      setToast({ tone: "bad", text: s.needAll });
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;

    const bodyEn = toParagraphs(draft.body_en);
    const trimmed = (v: string) => v.trim() || null;

    setSaving(true);
    const payload = {
      track: draft.track,
      month: dm,
      day: dd,
      title_ar: draft.title_ar.trim(),
      verse_ar: draft.verse_ar.trim(),
      verse_ref_ar: trimmed(draft.verse_ref_ar),
      body_ar: body,
      quote_ar: trimmed(draft.quote_ar),
      // The schema refuses an attribution with nothing to attribute, so the
      // name goes only where there is a quote under it.
      quote_source_ar: draft.quote_ar.trim() ? trimmed(draft.quote_source_ar) : null,
      title_en: trimmed(draft.title_en),
      verse_en: trimmed(draft.verse_en),
      verse_ref_en: trimmed(draft.verse_ref_en),
      body_en: bodyEn.length ? bodyEn : null,
      quote_en: trimmed(draft.quote_en),
      quote_source_en: draft.quote_en.trim() ? trimmed(draft.quote_source_en) : null,
      active: draft.active,
    };

    const { error } = draft.id
      ? await supabase.from("daily_devotions").update(payload).eq("id", draft.id)
      : await supabase.from("daily_devotions").insert(payload);

    setSaving(false);
    if (error) {
      // 23505 is the one-page-per-day constraint. It is the only failure here
      // an admin can act on, so it is the only one named.
      setToast({
        tone: "bad",
        text: error.code === "23505" ? s.duplicate : s.failed,
      });
      return;
    }
    setToast({ tone: "ok", text: s.saved });
    setDraft(null);
    setShowEn(false);
    await load().catch(() => {});
  };

  const remove = async (id: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from("daily_devotions").delete().eq("id", id);
    setConfirming(null);
    if (error) {
      setToast({ tone: "bad", text: s.failed });
      return;
    }
    setToast({ tone: "ok", text: s.removed });
    await load().catch(() => {});
  };

  const open = (d: Draft) => {
    setDraft(d);
    // The English half opens with the form when there is English in it.
    setShowEn(
      Boolean(d.title_en || d.verse_en || d.body_en || d.quote_en),
    );
  };

  const shown = (rows ?? []).filter((r) => filter === "all" || r.track === filter);
  const counts = {
    individual: (rows ?? []).filter((r) => r.track === "individual").length,
    couples: (rows ?? []).filter((r) => r.track === "couples").length,
  };

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts?: { rows?: number; dir?: "rtl" | "ltr"; hint?: string },
  ) => (
    <Labelled label={label} hint={opts?.hint}>
      <TextArea
        value={value}
        onChange={onChange}
        rows={opts?.rows ?? 1}
        dir={opts?.dir ?? "rtl"}
        aria-label={label}
      />
    </Labelled>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <ToastLine toast={toast} />

      {!draft && (
        <>
          <Button wide onClick={() => open(blank())}>
            {s.add}
          </Button>
          <div style={{ display: "flex", gap: 8, fontSize: 11.5, color: "var(--dim-3)" }}>
            <span>
              {s.individual} · {s.filled(counts.individual)}
            </span>
            <span>·</span>
            <span>
              {s.couples} · {s.filled(counts.couples)}
            </span>
          </div>
        </>
      )}

      {draft && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
          <Labelled label={s.track}>
            <Choice<DevotionTrack>
              value={draft.track}
              onChange={(track) => setDraft({ ...draft, track })}
              options={[
                { id: "individual", label: s.individual },
                { id: "couples", label: s.couples },
              ]}
            />
          </Labelled>

          <Labelled
            label={s.date}
            hint={
              dm && dd ? `${dayLabel(dm, dd)} — ${s.dateHint}` : s.dateHint
            }
          >
            <input
              type="date"
              value={draft.date}
              dir="ltr"
              // Bounded to the picker's own year, so the field cannot be
              // scrolled into a year whose value would be silently dropped.
              min={`${PICKER_YEAR}-01-01`}
              max={`${PICKER_YEAR}-12-31`}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              style={inputStyle(Boolean(clash))}
            />
          </Labelled>

          {clash && (
            <div
              style={{
                fontSize: 12,
                lineHeight: 1.6,
                color: "var(--danger)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                alignItems: "flex-start",
              }}
            >
              <span>{s.taken}</span>
              <Button tone="quiet" onClick={() => open(toDraft(clash))}>
                {s.edit}
              </Button>
            </div>
          )}

          {field(s.title, draft.title_ar, (v) => setDraft({ ...draft, title_ar: v }))}
          {field(s.verse, draft.verse_ar, (v) => setDraft({ ...draft, verse_ar: v }), {
            rows: 3,
          })}
          {field(
            s.verseRef,
            draft.verse_ref_ar,
            (v) => setDraft({ ...draft, verse_ref_ar: v }),
          )}
          {field(s.body, draft.body_ar, (v) => setDraft({ ...draft, body_ar: v }), {
            rows: 12,
            hint: `${s.bodyHint} ${s.paragraphs(toParagraphs(draft.body_ar).length)}`,
          })}
          {field(s.quote, draft.quote_ar, (v) => setDraft({ ...draft, quote_ar: v }), {
            rows: 3,
          })}
          {draft.quote_ar.trim() !== "" &&
            field(
              s.quoteSource,
              draft.quote_source_ar,
              (v) => setDraft({ ...draft, quote_source_ar: v }),
            )}

          <Switch
            on={showEn}
            label={s.english}
            onToggle={() => setShowEn(!showEn)}
          />

          {showEn && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                paddingInlineStart: 12,
                borderInlineStart: "2px solid rgb(var(--veil-rgb) / .1)",
              }}
            >
              <div style={{ fontSize: 11.5, color: "var(--dim-3)", lineHeight: 1.5 }}>
                {s.englishHint}
              </div>
              {field(s.title, draft.title_en, (v) => setDraft({ ...draft, title_en: v }), { dir: "ltr" })}
              {field(s.verse, draft.verse_en, (v) => setDraft({ ...draft, verse_en: v }), { rows: 3, dir: "ltr" })}
              {field(s.verseRef, draft.verse_ref_en, (v) => setDraft({ ...draft, verse_ref_en: v }), { dir: "ltr" })}
              {field(s.body, draft.body_en, (v) => setDraft({ ...draft, body_en: v }), {
                rows: 10,
                dir: "ltr",
                hint: `${s.bodyHint} ${s.paragraphs(toParagraphs(draft.body_en).length)}`,
              })}
              {field(s.quote, draft.quote_en, (v) => setDraft({ ...draft, quote_en: v }), { rows: 3, dir: "ltr" })}
              {draft.quote_en.trim() !== "" &&
                field(s.quoteSource, draft.quote_source_en, (v) => setDraft({ ...draft, quote_source_en: v }), { dir: "ltr" })}
            </div>
          )}

          <Switch
            on={draft.active}
            label={s.active}
            onToggle={() => setDraft({ ...draft, active: !draft.active })}
          />

          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={save} disabled={saving}>
              {saving ? s.loading : draft.id ? s.save : s.publish}
            </Button>
            <Button
              tone="quiet"
              onClick={() => {
                setDraft(null);
                setShowEn(false);
              }}
            >
              {s.cancel}
            </Button>
          </div>
        </div>
      )}

      {rows && rows.length > 0 && (
        <Choice<DevotionTrack | "all">
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: s.filterAll },
            { id: "individual", label: s.individual },
            { id: "couples", label: s.couples },
          ]}
        />
      )}

      {rows?.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--dim)", lineHeight: 1.7 }}>
          {s.empty}
        </div>
      )}

      {shown.map((r) => (
        <div
          key={r.id}
          style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 11.5,
              color: r.active ? "var(--accent-ink)" : "var(--dim-3)",
            }}
          >
            <span>{dayLabel(r.month, r.day)}</span>
            <span>·</span>
            <span>{r.track === "couples" ? s.couples : s.individual}</span>
            {!r.active && (
              <>
                <span>·</span>
                <span>{s.off}</span>
              </>
            )}
          </div>
          <div
            dir="rtl"
            style={{
              fontSize: 15,
              fontWeight: 500,
              lineHeight: 1.6,
              color: r.active ? "var(--body)" : "var(--dim)",
            }}
          >
            {r.title_ar}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--dim-3)" }}>
            {s.paragraphs(r.body_ar.length)}
            {r.title_en ? " · EN" : ""}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button tone="quiet" onClick={() => open(toDraft(r))}>
              {s.edit}
            </Button>
            {/* Two taps, like the verses panel. This is a page somebody typed
                out of a book by hand and there is no undo behind it. */}
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
      ))}
    </div>
  );
}
