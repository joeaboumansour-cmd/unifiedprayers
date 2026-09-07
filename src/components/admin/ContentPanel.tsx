"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, ToastLine, card, useToast } from "@/components/admin/AdminUI";
import { type Lang, bundledContent } from "@/lib/content";
import { getSupabase } from "@/lib/supabase/client";
import type { ContentRow } from "@/lib/supabase/types";

const S = {
  ar: {
    blurb:
      "نصوص الصلوات والواجهة. أي تعديل هنا يصل إلى كل الأجهزة دون إعادة نشر. النسخة المضمّنة في التطبيق تبقى كما هي، ويعود إليها التطبيق إذا كان المستند تالفًا.",
    edit: "تعديل",
    close: "إغلاق",
    save: "نشر",
    saving: "لحظة…",
    restore: "استعادة النسخة الأصلية",
    confirmRestore: "تأكيد الاستعادة",
    badJson: "الصيغة غير صالحة: ",
    saved: "تم النشر. ستصل التعديلات عند فتح التطبيق التالي.",
    restored: "تمت الاستعادة.",
    failed: "تعذّر الحفظ.",
    updated: "آخر تعديل",
    none: "لا مستندات. شغّل npm run seed:content مرة واحدة.",
    warn:
      "هذا الحقل يقبل JSON فقط. المستند الذي لا يطابق ما ينتظره التطبيق يُتجاهل بصمت ويظل النص المضمّن ظاهرًا.",
  },
  en: {
    blurb:
      "The prayer and interface text. Editing here reaches every device without a redeploy. The copy bundled in the app is untouched, and is what it falls back to if a document is malformed.",
    edit: "Edit",
    close: "Close",
    save: "Publish",
    saving: "One moment…",
    restore: "Restore the shipped copy",
    confirmRestore: "Confirm restore",
    badJson: "Not valid JSON: ",
    saved: "Published. Devices pick it up on their next launch.",
    restored: "Restored.",
    failed: "Could not save.",
    updated: "Last edited",
    none: "No documents. Run npm run seed:content once.",
    warn:
      "This field takes JSON only. A document that does not match what the app expects is ignored silently and the bundled text keeps showing.",
  },
} as const;

/**
 * Editing the content documents.
 *
 * A raw JSON field rather than a form, which is a deliberate limit: the
 * documents are deeply nested, bilingual and order-sensitive, and a form that
 * covered them would be a second copy of the schema to keep in step with
 * content.ts every time a string is added. The safety net is elsewhere and
 * already exists — the shape check in applyContent() ignores a document it does
 * not recognise, so the worst outcome of a bad edit is that readers keep seeing
 * the text that shipped.
 *
 * Restoring is therefore always available and always works, which is what makes
 * this editable at all.
 */
/**
 * The keys there is a shipped copy to fall back to.
 *
 * `teachings` is seeded from a file but is not one of them: nothing in the app
 * reads it yet, so content.ts does not import it and adding the import would
 * put 24KB into a bundle that never opens it. Restore is hidden for that row
 * rather than offered and refused.
 */
const RESTORABLE = new Set(Object.keys(bundledContent()));

export default function ContentPanel({ lang }: { lang: Lang }) {
  const s = S[lang];

  const [rows, setRows] = useState<ContentRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [toast, setToast] = useToast();

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = await supabase
      .from("content_documents")
      .select("key, doc, version, updated_at")
      .order("key");
    setRows(data ?? []);
  }, []);

  useEffect(() => {
    load().catch(() => setRows([]));
  }, [load]);

  const edit = (row: ContentRow) => {
    setOpen(row.key);
    // Pretty-printed: these are edited by a person, and a single line of
    // minified JSON is not something anyone can correct a typo in.
    setText(JSON.stringify(row.doc, null, 2));
  };

  const save = async (key: ContentRow["key"]) => {
    if (saving) return;
    let doc: unknown;
    try {
      doc = JSON.parse(text);
    } catch (err) {
      setToast({ tone: "bad", text: s.badJson + (err as Error).message });
      return;
    }

    const supabase = getSupabase();
    if (!supabase) return;
    setSaving(true);
    const { error } = await supabase
      .from("content_documents")
      .update({ doc })
      .eq("key", key);
    setSaving(false);

    if (error) {
      setToast({ tone: "bad", text: s.failed });
      return;
    }
    setToast({ tone: "ok", text: s.saved });
    await load().catch(() => {});
  };

  const restore = async (key: ContentRow["key"]) => {
    const doc = (bundledContent() as Record<string, unknown>)[key];
    setConfirming(null);
    if (doc === undefined) return;

    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase
      .from("content_documents")
      .update({ doc })
      .eq("key", key);

    if (error) {
      setToast({ tone: "bad", text: s.failed });
      return;
    }
    setToast({ tone: "ok", text: s.restored });
    if (open === key) setText(JSON.stringify(doc, null, 2));
    await load().catch(() => {});
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <ToastLine toast={toast} />

      <div style={{ fontSize: 13, color: "var(--dim)", lineHeight: 1.8 }}>
        {s.blurb}
      </div>

      {rows?.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--dim)" }}>{s.none}</div>
      )}

      {rows?.map((r) => {
        const isOpen = open === r.key;
        return (
          <div key={r.key} style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }} dir="ltr">
                {r.key}
              </span>
              <span style={{ fontSize: 11.5, color: "var(--dim-3)" }} dir="ltr">
                {s.updated} {new Date(r.updated_at).toLocaleDateString("en-CA")}
              </span>
            </div>

            {isOpen && (
              <>
                <div style={{ fontSize: 11.5, color: "var(--dim-3)", lineHeight: 1.6 }}>
                  {s.warn}
                </div>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  dir="ltr"
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  rows={16}
                  style={{
                    appearance: "none",
                    width: "100%",
                    boxSizing: "border-box",
                    background: "var(--well)",
                    border: "1px solid rgb(var(--veil-rgb) / .1)",
                    borderRadius: 12,
                    padding: 12,
                    color: "var(--body)",
                    fontSize: 12,
                    lineHeight: 1.6,
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                    resize: "vertical",
                    whiteSpace: "pre",
                  }}
                />
              </>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {isOpen ? (
                <>
                  <Button onClick={() => save(r.key)} disabled={saving}>
                    {saving ? s.saving : s.save}
                  </Button>
                  <Button tone="quiet" onClick={() => setOpen(null)}>
                    {s.close}
                  </Button>
                </>
              ) : (
                <Button tone="quiet" onClick={() => edit(r)}>
                  {s.edit}
                </Button>
              )}
              {RESTORABLE.has(r.key) && (
                <Button
                  tone="danger"
                  onClick={() =>
                    confirming === r.key ? restore(r.key) : setConfirming(r.key)
                  }
                >
                  {confirming === r.key ? s.confirmRestore : s.restore}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
