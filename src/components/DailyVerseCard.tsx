"use client";

import { useEffect, useRef, useState } from "react";

import { whenRevealed } from "@/components/LaunchSplash";
import type { Lang } from "@/lib/content";
import type { DailyVerseState } from "@/lib/useDailyVerse";

const T = {
  kicker: { ar: "آيتك لليوم", en: "Your verse today" },
  translation: { ar: "ترجمة فان دايك", en: "World English Bible" },
} as const;

/**
 * The daily verse, whole, at the top of the Today tab.
 *
 * Where a tapped notification lands. The notification may have had to cut a
 * long verse off with an ellipsis; here it is complete, under the topic it was
 * chosen for, with the translation named beneath it as the readings are.
 *
 * Arriving from the notification, the tab scrolls to it and it glows once —
 * enough for the eye to find it, and then it is an ordinary card again.
 */
export default function DailyVerseCard({ lang, daily }: { lang: Lang; daily: DailyVerseState }) {
  const ref = useRef<HTMLDivElement>(null);
  const { verse, arrived, settle } = daily;
  const [glowing, setGlowing] = useState(false);

  useEffect(() => {
    if (!arrived || !verse) return;
    let done = 0;
    // Not under the launch splash: the arrival is the point, so it waits until
    // there is something to see it against.
    const stop = whenRevealed(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setGlowing(true);
      done = window.setTimeout(() => {
        setGlowing(false);
        settle();
      }, 2600);
    });
    return () => {
      stop();
      window.clearTimeout(done);
    };
  }, [arrived, verse, settle]);

  if (!verse) return null;

  const ar = lang === "ar";
  const text = ar ? verse.ar : verse.en;
  const reference = ar ? verse.ref_ar : verse.ref_en;
  const topic = ar ? verse.topic.ar : verse.topic.en;

  return (
    <div
      ref={ref}
      className={glowing ? "dv-arrive" : undefined}
      style={{
        position: "relative",
        overflow: "hidden",
        marginBottom: 26,
        padding: "18px 18px 16px",
        borderRadius: 22,
        scrollMarginTop: 16,
        background:
          "linear-gradient(150deg, rgb(var(--accent-rgb) / .13), rgb(var(--veil-rgb) / .03) 60%)",
        border: "1px solid rgb(var(--accent-rgb) / .22)",
      }}
    >
      {/* A soft light in the corner the kicker sits in, like the resume cards. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: -60,
          insetInlineStart: -40,
          width: 170,
          height: 170,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgb(var(--accent-rgb) / .22), rgb(var(--accent-rgb) / 0) 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: ar ? 0 : ".12em",
            textTransform: "uppercase",
            color: "var(--accent-ink)",
          }}
        >
          {T.kicker[lang]}
        </span>
        <span
          style={{
            padding: "3px 10px",
            borderRadius: 999,
            fontSize: 11.5,
            color: "var(--accent-ink)",
            background: "rgb(var(--accent-rgb) / .12)",
            border: "1px solid rgb(var(--accent-rgb) / .24)",
          }}
        >
          {topic}
        </span>
      </div>

      <p
        className="selectable"
        lang={lang}
        style={{
          position: "relative",
          margin: 0,
          fontSize: ar ? 18 : 17,
          lineHeight: ar ? 2.05 : 1.75,
          color: "var(--body)",
        }}
      >
        {text}
      </p>

      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          marginTop: 12,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--accent-ink)" }}>{reference}</span>
        <span style={{ fontSize: 10.5, color: "var(--dim-4)" }}>{T.translation[lang]}</span>
      </div>
    </div>
  );
}
