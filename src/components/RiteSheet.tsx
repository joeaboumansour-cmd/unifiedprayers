"use client";

import type { Lang } from "@/lib/content";
import { RITES, RITE_HINT, RITE_LABEL, type Rite } from "@/lib/liturgy";
import { sheetMotion, useSheetDrag } from "@/lib/useSheetDrag";
import type { Liturgy } from "@/lib/useLiturgy";

const EASE = "cubic-bezier(.22,1,.36,1)";

const T = {
  title: { ar: "كنيستك", en: "Your church" },
  hint: {
    ar: "تحدّد الأعياد والأصوام والأزمنة التي تحفظها هذه الروزنامة.",
    en: "Sets which feasts, fasts and seasons this calendar keeps.",
  },
  alsoName: { ar: "أظهر الروزنامة اللاتينية أيضًا", en: "Also show the Latin calendar" },
  alsoHint: {
    ar: "طبقة ثانية تحت روزنامتك، ومعلَّمة باسمها.",
    en: "A second layer under your own, each entry marked with its rite.",
  },
} as const;

/**
 * Which church's year the Calendar tab keeps.
 *
 * Two entries today. The list is built from the rites the engine actually has
 * a season module for, so adding the Melkite or Coptic year puts it here on
 * its own — there is no separate list of names to keep in step.
 */
export default function RiteSheet({
  open,
  lang,
  liturgy,
  onClose,
}: {
  open: boolean;
  lang: Lang;
  liturgy: Liturgy;
  onClose: () => void;
}) {
  const drag = useSheetDrag(open, onClose);
  const ar = lang === "ar";
  // The second layer is the Latin calendar, so it is meaningless to somebody
  // already reading it.
  const showAlso = liturgy.rite !== "roman";

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--scrim)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          transition: "opacity .35s ease",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
      />
      <div
        role="dialog"
        aria-modal={open}
        aria-label={T.title[lang]}
        style={{
          position: "absolute",
          insetInline: 0,
          bottom: 0,
          borderRadius: "28px 28px 0 0",
          background: "var(--surface)",
          borderTop: "1px solid rgb(var(--veil-rgb) / .1)",
          /* Nine churches is more than fits. The sheet is capped and its body
             scrolls; the padding moves onto the two halves below so the
             scrolling half can run under the rounded top edge rather than
             stopping short of it. */
          maxHeight: "80%",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          boxShadow: "0 -20px 60px rgb(var(--shadow-rgb) / var(--shadow-a))",
          ...sheetMotion(open, drag, "105%", EASE),
          pointerEvents: open ? "auto" : "none",
          // The toggle's knob travels the other way when the shell mirrors.
          // Set here rather than inherited: this sheet is a sibling of the
          // home screen, not a child of it.
          ["--knob" as string]: ar ? "-18px" : "18px",
        }}
      >
        <div
          {...drag.handlers}
          style={{
            flex: "none",
            display: "flex",
            justifyContent: "center",
            padding: "14px 0 16px",
            cursor: "grab",
            // The sheet drags from here and only here: the body scrolls, and
            // one finger cannot mean both.
            touchAction: "none",
          }}
        >
          <div
            style={{
              width: 38,
              height: 4,
              borderRadius: 999,
              background: "rgb(var(--veil-rgb) / .22)",
            }}
          />
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            // A flick that reaches the end of this list must not then scroll
            // the calendar behind the sheet.
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
            padding: "0 18px max(22px, var(--safe-b))",
          }}
        >
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
          {T.title[lang]}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: "var(--dim)",
            marginBottom: 16,
            lineHeight: 1.6,
          }}
        >
          {T.hint[lang]}
        </div>

        <div
          role="radiogroup"
          aria-label={T.title[lang]}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          {RITES.map((r: Rite) => {
            const on = r === liturgy.rite;
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={on}
                className="tap"
                onClick={() => {
                  liturgy.setRite(r);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "14px 15px",
                  borderRadius: 16,
                  textAlign: "start",
                  transition: "background .25s ease,border-color .25s ease",
                  background: on
                    ? "rgb(var(--accent-rgb) / .12)"
                    : "rgb(var(--veil-rgb) / .035)",
                  border: `1px solid ${
                    on ? "rgb(var(--accent-rgb) / .45)" : "rgb(var(--veil-rgb) / .07)"
                  }`,
                }}
              >
                <span
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 500,
                      color: on ? "var(--accent-ink)" : "var(--ink)",
                    }}
                  >
                    {RITE_LABEL[r][lang]}
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--dim)" }}>
                    {RITE_HINT[r][lang]}
                  </span>
                </span>
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: `1px solid ${on ? "var(--accent)" : "rgb(var(--veil-rgb) / .2)"}`,
                    background: on ? "var(--accent)" : "transparent",
                    flex: "none",
                  }}
                />
              </button>
            );
          })}
        </div>

        {showAlso && (
          <button
            type="button"
            role="switch"
            aria-checked={liturgy.alsoRoman}
            onClick={() => {
              liturgy.setAlsoRoman(!liturgy.alsoRoman);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              textAlign: "start",
              marginTop: 16,
              paddingTop: 15,
              borderTop: "1px solid rgb(var(--veil-rgb) / .07)",
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14, color: "var(--ink)" }}>
                {T.alsoName[lang]}
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: 11.5,
                  color: "var(--dim)",
                  marginTop: 3,
                  lineHeight: 1.55,
                }}
              >
                {T.alsoHint[lang]}
              </span>
            </span>
            <span
              style={{
                flex: "none",
                width: 44,
                height: 26,
                borderRadius: 999,
                padding: 2,
                background: liturgy.alsoRoman
                  ? "var(--accent)"
                  : "rgb(var(--veil-rgb) / .14)",
                transition: "background .3s ease",
              }}
            >
              <span
                style={{
                  display: "block",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "var(--switch-knob)",
                  transition: `transform .3s ${EASE}`,
                  transform: liturgy.alsoRoman
                    ? "translateX(var(--knob))"
                    : "translateX(0)",
                }}
              />
            </span>
          </button>
        )}
        </div>
      </div>
    </>
  );
}
