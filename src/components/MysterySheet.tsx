"use client";

import {
  type Lang,
  type MysteryKey,
  setDays,
  setLabel,
  sets,
  ui,
} from "@/lib/content";

const EASE = "cubic-bezier(.22,1,.36,1)";

export default function MysterySheet({
  open,
  lang,
  selected,
  onPick,
  onStart,
  onClose,
}: {
  open: boolean;
  lang: Lang;
  selected: MysteryKey;
  onPick: (k: MysteryKey) => void;
  onStart: () => void;
  onClose: () => void;
}) {
  const t = ui(lang);
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
        aria-label={t.sheetTitle}
        style={{
          position: "absolute",
          insetInline: 0,
          bottom: 0,
          borderRadius: "28px 28px 0 0",
          background: "var(--surface)",
          borderTop: "1px solid rgba(255,255,255,.1)",
          padding: "14px 18px max(22px, var(--safe-b))",
          boxShadow: "0 -20px 60px rgba(0,0,0,.5)",
          transition: `transform .48s ${EASE}`,
          transform: open ? "translateY(0)" : "translateY(105%)",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        <div
          style={{
            width: 38,
            height: 4,
            borderRadius: 999,
            background: "rgba(255,255,255,.22)",
            margin: "0 auto 16px",
          }}
        />
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
          {t.sheetTitle}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: "var(--dim)",
            marginBottom: 16,
            lineHeight: 1.6,
          }}
        >
          {t.sheetHint}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 16,
          }}
        >
          {sets().map((k) => {
            const on = k === selected;
            return (
              <button
                key={k}
                type="button"
                className="tap"
                onClick={() => onPick(k)}
                aria-pressed={on}
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
                    : "rgba(255,255,255,.035)",
                  border: `1px solid ${
                    on ? "rgb(var(--accent-rgb) / .45)" : "rgba(255,255,255,.07)"
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
                      color: on ? "var(--accent)" : "var(--ink)",
                    }}
                  >
                    {setLabel(lang, k)}
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--dim)" }}>
                    {setDays(lang, k)}
                  </span>
                </span>
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: `1px solid ${on ? "var(--accent)" : "rgba(255,255,255,.2)"}`,
                    background: on ? "var(--accent)" : "transparent",
                    flex: "none",
                  }}
                />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="tap"
          onClick={onStart}
          style={{
            width: "100%",
            height: 50,
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg,var(--accent),var(--accent-deep))",
            color: "var(--on-accent)",
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          {t.startPraying}
        </button>
      </div>
    </>
  );
}
