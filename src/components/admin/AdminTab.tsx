"use client";

import { useState } from "react";

import AnnouncementsPanel from "@/components/admin/AnnouncementsPanel";
import ContentPanel from "@/components/admin/ContentPanel";
import DevotionsPanel from "@/components/admin/DevotionsPanel";
import NotifyPanel from "@/components/admin/NotifyPanel";
import VersesPanel from "@/components/admin/VersesPanel";
import type { Lang } from "@/lib/content";

/**
 * The admin tab.
 *
 * It is inside the app rather than on a route of its own, which means it lives
 * under the same phone-width layout as everything else — hence one section at a
 * time behind a segmented control, rather than a dashboard.
 *
 * Nothing here is a security boundary. The tab is only rendered for an admin,
 * but that is so a non-admin is not shown a wall of buttons that would all be
 * refused; the refusing is done by the RLS policies in 0003 and 0004 and by the
 * server-side check in the /api/admin routes.
 */

type Section = "verses" | "devotions" | "messages" | "notify" | "content";

const S = {
  ar: {
    verses: "الآيات",
    devotions: "التأمّلات",
    messages: "الرسائل",
    notify: "الإشعارات",
    content: "النصوص",
  },
  en: {
    verses: "Verses",
    devotions: "Devotions",
    messages: "Messages",
    notify: "Notifications",
    content: "Content",
  },
} as const;

const ORDER: Section[] = ["verses", "devotions", "messages", "notify", "content"];

export default function AdminTab({ lang }: { lang: Lang }) {
  const [section, setSection] = useState<Section>("verses");
  const s = S[lang];

  return (
    <div>
      <div
        role="tablist"
        aria-label={s.notify}
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          marginBottom: 20,
          borderRadius: 999,
          background: "rgb(var(--veil-rgb) / .04)",
          border: "1px solid rgb(var(--veil-rgb) / .07)",
          // The labels have not fitted on a narrow phone since there were
          // four of them; scrolling beats truncating them into initials.
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {ORDER.map((id) => {
          const on = id === section;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setSection(id)}
              style={{
                appearance: "none",
                flex: "1 0 auto",
                whiteSpace: "nowrap",
                borderRadius: 999,
                border: "none",
                padding: "9px 14px",
                fontSize: 13,
                fontWeight: 500,
                fontFamily: "inherit",
                cursor: "pointer",
                transition: "background .25s ease, color .25s ease",
                color: on ? "var(--on-accent)" : "var(--soft)",
                background: on ? "rgb(var(--accent-rgb) / .9)" : "transparent",
              }}
            >
              {s[id]}
            </button>
          );
        })}
      </div>

      {/* Unmounted rather than hidden, so switching away drops a half-typed
          draft's listeners and a panel always opens on fresh data. */}
      {section === "verses" && <VersesPanel lang={lang} />}
      {section === "devotions" && <DevotionsPanel lang={lang} />}
      {section === "messages" && <AnnouncementsPanel lang={lang} />}
      {section === "notify" && <NotifyPanel lang={lang} />}
      {section === "content" && <ContentPanel lang={lang} />}
    </div>
  );
}
