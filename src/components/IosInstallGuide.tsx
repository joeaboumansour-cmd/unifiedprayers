"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

/**
 * How to put the app on an iPhone's home screen, shown rather than told.
 *
 * Safari has no install button to press on somebody's behalf — Apple never
 * shipped `beforeinstallprompt` — so the only way in is three or four taps
 * through menus most people have never opened. A sentence naming them was
 * asking the reader to translate words into places on a screen they could not
 * see at the same time. This draws the places: a small picture of each of
 * Safari's own controls in turn, the one to tap pulsing, beside a numbered
 * list that follows along, and an arrow outside the sheet at where the real
 * button is.
 *
 * The pictures are sketches, not screenshots. Only the thing to tap carries
 * words; everything around it is a grey bar. Apple rearranges these menus
 * most autumns, and a sketch that names only its target stays right through
 * a redesign that a screenshot would not survive.
 *
 * Which route depends on the browser, because the button is in a different
 * place in each — and inside Instagram or Facebook there is no route at all,
 * so that one says so and sends the reader to Safari first.
 *
 * English only, like the rest of the install sheet: see PwaLayer.
 */

export type IosFlow = "safari" | "safari-legacy" | "ipad" | "chrome" | "other" | "inapp";

/** Where the real control is, for the arrow PwaLayer draws outside the sheet. */
export type Pointer = "bottom-right" | "bottom-center" | "top-right" | null;

export const IOS_FLOWS: readonly IosFlow[] = ["safari", "safari-legacy", "ipad", "chrome", "other", "inapp"];

/**
 * Which route this device needs.
 *
 * Safari 26 reports its own version truthfully in `Version/26` but freezes
 * the OS in the user agent at 18_x, so the Safari version is the one to read:
 * 26 is where Share moved inside the ··· menu on iPhone.
 */
export function detectIosFlow(): IosFlow {
  const ua = navigator.userAgent;
  // In-app browsers: no Add to Home Screen anywhere in them.
  if (/FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|Snapchat|musical_ly|Bytedance|TikTok|LinkedInApp|Twitter|GSA\//i.test(ua)) {
    return "inapp";
  }
  if (/CriOS/i.test(ua)) return "chrome";
  if (/FxiOS|EdgiOS|OPiOS|OPT\//i.test(ua)) return "other";
  // A web view without Safari's token is some other app's browser.
  if (!/Safari\//.test(ua)) return "inapp";
  const iPad = /iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (iPad) return "ipad";
  const version = Number(ua.match(/Version\/(\d+)/)?.[1] ?? 0);
  return version >= 26 ? "safari" : "safari-legacy";
}

export const POINTER: Record<IosFlow, Pointer> = {
  safari: "bottom-right",
  "safari-legacy": "bottom-center",
  ipad: "top-right",
  chrome: "top-right",
  other: null,
  inapp: "top-right",
};

/* ------------------------------------------------------------------ icons */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Safari's Share glyph: a box with an arrow leaving it. */
export function ShareGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...stroke}>
      <path d="M8.5 9.5H7a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17 9.5h-1.5" />
      <path d="M12 3.5v11M8.5 7 12 3.5 15.5 7" />
    </svg>
  );
}

function MoreGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">
      <circle cx="5.5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="18.5" cy="12" r="1.9" />
    </svg>
  );
}

function AddGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...stroke}>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

function CompassGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...stroke}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </svg>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} aria-hidden="true" {...stroke}>
      <path d={dir === "left" ? "M14.5 6 8.5 12l6 6" : "M9.5 6l6 6-6 6"} />
    </svg>
  );
}

/** The inline key in a step's sentence: the glyph the reader is looking for. */
function Key({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        verticalAlign: "-3px",
        padding: "1px 7px",
        margin: "0 1px",
        borderRadius: 7,
        fontSize: 12.5,
        fontWeight: 600,
        color: "var(--accent-ink)",
        background: "rgb(var(--accent-rgb) / .12)",
        border: "1px solid rgb(var(--accent-rgb) / .28)",
      }}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- sketches */

const glass: CSSProperties = {
  background: "rgb(var(--veil-rgb) / .09)",
  border: "1px solid rgb(var(--veil-rgb) / .12)",
  color: "var(--soft-2)",
};

/** A grey bar standing in for words that are not the point. */
function Bar({ w, h = 6 }: { w: number | string; h?: number }) {
  return <span style={{ display: "block", width: w, height: h, borderRadius: 99, background: "rgb(var(--veil-rgb) / .14)" }} />;
}

/** The control to tap: ringed, pulsing, and with a fingertip landing on it. */
function Target({ children, style, round }: { children: ReactNode; style?: CSSProperties; round?: boolean }) {
  return (
    <span
      className="ig-target"
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        borderRadius: round ? 999 : 10,
        color: "var(--accent-ink)",
        background: "rgb(var(--accent-rgb) / .16)",
        ...style,
      }}
    >
      {children}
      <span className="ig-tap" aria-hidden="true" />
    </span>
  );
}

/** Faint page content, so the chrome reads as sitting over a page. */
function Page({ top = 16 }: { top?: number }) {
  return (
    <div style={{ position: "absolute", insetInline: 18, top, display: "grid", gap: 8, opacity: 0.55 }}>
      <Bar w="46%" h={8} />
      <Bar w="88%" />
      <Bar w="72%" />
    </div>
  );
}

function Row({ icon, children }: { icon?: ReactNode; children?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "0 12px", height: 30 }}>
      {children ?? <Bar w="52%" />}
      <span style={{ opacity: 0.45, display: "inline-flex" }}>{icon ?? <Bar w={12} h={12} />}</span>
    </div>
  );
}

/** Safari 26 on iPhone: back, the address, and ··· in one floating bar. */
function SketchMoreBar() {
  return (
    <>
      <Page />
      <div style={{ position: "absolute", insetInline: 12, bottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ ...glass, width: 38, height: 38, borderRadius: 99, display: "grid", placeItems: "center" }}>
          <Chevron dir="left" />
        </span>
        <span style={{ ...glass, flex: 1, height: 38, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12 }}>
          <Bar w={9} h={9} />
          <span style={{ opacity: 0.8 }}>unifiedprayers</span>
        </span>
        <Target round style={{ width: 38, height: 38 }}>
          <MoreGlyph size={18} />
        </Target>
      </div>
    </>
  );
}

/** Earlier Safari on iPhone: Share sits in the middle of the bottom toolbar. */
function SketchLegacyBar() {
  return (
    <>
      <Page />
      <div style={{ position: "absolute", insetInline: 12, bottom: 50, height: 30, ...glass, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
        <span style={{ opacity: 0.8 }}>unifiedprayers</span>
      </div>
      <div style={{ position: "absolute", insetInline: 8, bottom: 8, height: 36, display: "flex", alignItems: "center", justifyContent: "space-around", color: "var(--soft-2)" }}>
        <span style={{ opacity: 0.5 }}><Chevron dir="left" /></span>
        <span style={{ opacity: 0.3 }}><Chevron dir="right" /></span>
        <Target style={{ width: 38, height: 34 }}>
          <ShareGlyph size={19} />
        </Target>
        <span style={{ opacity: 0.5 }}><Bar w={16} h={14} /></span>
        <span style={{ opacity: 0.5 }}><Bar w={16} h={14} /></span>
      </div>
    </>
  );
}

/** Share at the top right: iPad Safari, Chrome and most other browsers. */
function SketchTopShare({ label }: { label: string }) {
  return (
    <>
      <div style={{ position: "absolute", insetInline: 12, top: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ ...glass, flex: 1, height: 36, borderRadius: 12, display: "flex", alignItems: "center", paddingInline: 12, fontSize: 12 }}>
          <span style={{ opacity: 0.8 }}>{label}</span>
        </span>
        <Target style={{ width: 38, height: 36 }}>
          <ShareGlyph size={19} />
        </Target>
      </div>
      <Page top={64} />
    </>
  );
}

/** The ··· menu, opened: Share is the item. */
function SketchMenu() {
  return (
    <>
      <Page />
      <div style={{ position: "absolute", right: 12, bottom: 12, width: 38, height: 38, borderRadius: 99, ...glass, display: "grid", placeItems: "center", opacity: 0.5 }}>
        <MoreGlyph size={18} />
      </div>
      <div
        style={{
          position: "absolute",
          right: 12,
          bottom: 58,
          width: 184,
          padding: "6px 0 4px",
          borderRadius: 16,
          background: "var(--surface)",
          border: "1px solid rgb(var(--veil-rgb) / .14)",
          boxShadow: "0 10px 30px rgb(var(--shadow-rgb) / .35)",
        }}
      >
        <div style={{ padding: "0 5px" }}>
          <Target style={{ width: "100%", height: 32, justifyContent: "space-between", paddingInline: 8, fontSize: 13, fontWeight: 600 }}>
            <span>Share</span>
            <ShareGlyph size={16} />
          </Target>
        </div>
        <Row />
      </div>
    </>
  );
}

/** The share sheet, scrolled to the row that matters. */
function SketchShareSheet() {
  return (
    <div
      style={{
        position: "absolute",
        insetInline: 8,
        top: 10,
        bottom: -12,
        borderRadius: "18px 18px 0 0",
        background: "var(--surface)",
        border: "1px solid rgb(var(--veil-rgb) / .14)",
        padding: "10px 0 0",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 12px 8px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={26} height={26} style={{ borderRadius: 7 }} />
        <div style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--body)" }}>Unified Prayers</span>
          <Bar w={70} h={5} />
        </div>
      </div>
      <Row />
      <div style={{ padding: "2px 6px" }}>
        <Target style={{ width: "100%", height: 32, justifyContent: "space-between", paddingInline: 8, fontSize: 13, fontWeight: 600 }}>
          <span>Add to Home Screen</span>
          <AddGlyph size={17} />
        </Target>
      </div>
      <Row />
      {/* Nudges a thumb to scroll: the row is usually below the fold. */}
      <span className="ig-scroll" aria-hidden="true" style={{ position: "absolute", right: 14, top: 12, fontSize: 10, color: "var(--dim-3)", display: "flex", alignItems: "center", gap: 3 }}>
        scroll
        <svg viewBox="0 0 24 24" width={11} height={11} {...stroke}>
          <path d="M12 5v14M6.5 13.5 12 19l5.5-5.5" />
        </svg>
      </span>
    </div>
  );
}

/** The last screen: the name, the switch that makes it an app, and Add. */
function SketchAddDialog({ webAppToggle }: { webAppToggle: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        insetInline: 8,
        top: 10,
        bottom: -12,
        borderRadius: "18px 18px 0 0",
        background: "var(--surface)",
        border: "1px solid rgb(var(--veil-rgb) / .14)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 8px 8px 14px", fontSize: 12 }}>
        <span style={{ color: "var(--dim-3)" }}>Cancel</span>
        <span style={{ fontWeight: 600, color: "var(--body)" }}>Add to Home Screen</span>
        <Target style={{ height: 28, paddingInline: 12, fontSize: 13, fontWeight: 700 }}>Add</Target>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 12px", padding: 8, borderRadius: 12, background: "rgb(var(--veil-rgb) / .05)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={34} height={34} style={{ borderRadius: 9 }} />
        <div style={{ display: "grid", gap: 5 }}>
          <span style={{ fontSize: 12.5, color: "var(--body)" }}>Unified Prayers</span>
          <Bar w={90} h={5} />
        </div>
      </div>
      {webAppToggle && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "8px 12px 0", padding: "0 8px", fontSize: 12, color: "var(--body)" }}>
          <span>Open as Web App</span>
          <span style={{ width: 34, height: 20, borderRadius: 99, background: "var(--accent)", position: "relative" }}>
            <span style={{ position: "absolute", right: 2, top: 2, width: 16, height: 16, borderRadius: 99, background: "var(--switch-knob)" }} />
          </span>
        </div>
      )}
    </div>
  );
}

/** Inside Instagram and the like: out to Safari first. */
function SketchInApp() {
  return (
    <>
      <div style={{ position: "absolute", insetInline: 12, top: 12, display: "flex", alignItems: "center", gap: 10, color: "var(--soft-2)" }}>
        <span style={{ opacity: 0.6, fontSize: 16, lineHeight: 1 }}>✕</span>
        <span style={{ flex: 1, display: "grid", gap: 4 }}>
          <Bar w="40%" h={7} />
          <Bar w="30%" h={5} />
        </span>
        <Target round style={{ width: 34, height: 34 }}>
          <MoreGlyph size={17} />
        </Target>
      </div>
      <div
        style={{
          position: "absolute",
          right: 12,
          top: 54,
          width: 176,
          padding: "5px 0",
          borderRadius: 14,
          background: "var(--surface)",
          border: "1px solid rgb(var(--veil-rgb) / .14)",
          boxShadow: "0 10px 30px rgb(var(--shadow-rgb) / .35)",
        }}
      >
        <Row />
        <div style={{ padding: "0 5px" }}>
          <Target style={{ width: "100%", height: 32, justifyContent: "space-between", paddingInline: 8, fontSize: 12.5, fontWeight: 600 }}>
            <span>Open in Safari</span>
            <CompassGlyph size={16} />
          </Target>
        </div>
        <Row />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ routes */

type Step = { text: ReactNode; sketch: ReactNode };

function stepsFor(flow: IosFlow): Step[] {
  const add: Step = {
    text: (
      <>
        Scroll down and tap <Key>Add to Home Screen <AddGlyph size={13} /></Key>
      </>
    ),
    sketch: <SketchShareSheet />,
  };
  const confirm = (webApp: boolean): Step => ({
    text: webApp ? (
      <>
        Keep <strong style={{ fontWeight: 600 }}>Open as Web App</strong> on, then tap <Key>Add</Key>
      </>
    ) : (
      <>
        Tap <Key>Add</Key> at the top right — done
      </>
    ),
    sketch: <SketchAddDialog webAppToggle={webApp} />,
  });

  switch (flow) {
    case "safari":
      return [
        {
          text: (
            <>
              Tap <Key><MoreGlyph size={13} /></Key> at the bottom right of Safari
            </>
          ),
          sketch: <SketchMoreBar />,
        },
        {
          text: (
            <>
              Tap <Key>Share <ShareGlyph size={13} /></Key>
            </>
          ),
          sketch: <SketchMenu />,
        },
        add,
        confirm(true),
      ];
    case "safari-legacy":
      return [
        {
          text: (
            <>
              Tap <Key><ShareGlyph size={13} /></Key> in the middle of Safari&apos;s bottom bar
            </>
          ),
          sketch: <SketchLegacyBar />,
        },
        add,
        confirm(false),
      ];
    case "ipad":
      return [
        {
          text: (
            <>
              Tap <Key><ShareGlyph size={13} /></Key> at the top right of Safari
            </>
          ),
          sketch: <SketchTopShare label="unifiedprayers" />,
        },
        add,
        confirm(true),
      ];
    case "chrome":
      return [
        {
          text: (
            <>
              Tap <Key><ShareGlyph size={13} /></Key> in Chrome&apos;s address bar, top right
            </>
          ),
          sketch: <SketchTopShare label="unifiedprayers" />,
        },
        add,
        confirm(false),
      ];
    case "other":
      return [
        {
          text: (
            <>
              Find <Key>Share <ShareGlyph size={13} /></Key> — in the address bar or your browser&apos;s menu
            </>
          ),
          sketch: <SketchTopShare label="unifiedprayers" />,
        },
        add,
        confirm(false),
      ];
    case "inapp":
      return [
        {
          text: (
            <>
              This page is open inside another app. Tap <Key><MoreGlyph size={13} /></Key> and choose{" "}
              <Key>Open in Safari <CompassGlyph size={13} /></Key>
            </>
          ),
          sketch: <SketchInApp />,
        },
        {
          text: <>In Safari, this guide opens again and shows the rest</>,
          sketch: <SketchMoreBar />,
        },
      ];
  }
}

/* -------------------------------------------------------------- the guide */

/** Long enough to find the button on the real screen before the next picture. */
const STEP_MS = 3000;

export default function IosInstallGuide({ flow, open }: { flow: IosFlow; open: boolean }) {
  const steps = stepsFor(flow);
  const [active, setActive] = useState(0);
  // A tap on a step means the reader is choosing; the slideshow stops for them.
  const [held, setHeld] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setActive(0);
    setHeld(false);
  }, [flow, open]);

  useEffect(() => {
    if (!open || held) return;
    // Somebody who has asked for no motion gets the steps to tap through.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % steps.length), STEP_MS);
    return () => window.clearInterval(id);
  }, [open, held, steps.length]);

  const copyLink = async () => {
    try {
      // With ?install, so Safari opens straight onto the rest of this guide.
      await navigator.clipboard.writeText(`${location.origin}/?install`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* no clipboard in this web view — the Safari route above still works */
    }
  };

  return (
    <div>
      {/* The picture of the current step. Every frame stays mounted and
          crossfades, so switching steps never reflows the sheet. */}
      <div
        aria-hidden="true"
        style={{
          position: "relative",
          height: 156,
          borderRadius: 18,
          overflow: "hidden",
          marginBottom: 12,
          background:
            "linear-gradient(180deg, rgb(var(--veil-rgb) / .05), rgb(var(--veil-rgb) / .02))",
          border: "1px solid rgb(var(--veil-rgb) / .08)",
        }}
      >
        {steps.map((s, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              opacity: i === active ? 1 : 0,
              transform: i === active ? "none" : "translateY(6px)",
              transition: "opacity .45s ease, transform .45s ease",
            }}
          >
            {s.sketch}
          </div>
        ))}
      </div>

      <ol style={{ listStyle: "none", margin: "0 0 12px", padding: 0, display: "grid", gap: 6 }}>
        {steps.map((s, i) => {
          const on = i === active;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  setActive(i);
                  setHeld(true);
                }}
                aria-current={on ? "step" : undefined}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "9px 11px",
                  borderRadius: 13,
                  textAlign: "left",
                  fontFamily: "inherit",
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  color: on ? "var(--body)" : "var(--dim)",
                  background: on ? "rgb(var(--accent-rgb) / .08)" : "transparent",
                  border: `1px solid ${on ? "rgb(var(--accent-rgb) / .24)" : "transparent"}`,
                  transition: "background .3s ease, border-color .3s ease, color .3s ease, scale var(--t-rise) var(--ease-out)",
                }}
              >
                <span
                  style={{
                    flex: "none",
                    width: 22,
                    height: 22,
                    borderRadius: 99,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: on ? "var(--on-accent)" : "var(--dim-2)",
                    background: on ? "var(--accent)" : "rgb(var(--veil-rgb) / .08)",
                    transition: "background .3s ease, color .3s ease",
                  }}
                >
                  {i + 1}
                </span>
                <span>{s.text}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {flow === "inapp" && (
        <button
          type="button"
          onClick={copyLink}
          style={{
            width: "100%",
            height: 44,
            marginBottom: 10,
            borderRadius: 14,
            fontSize: 13.5,
            fontWeight: 600,
            color: "var(--accent-ink)",
            background: "rgb(var(--accent-rgb) / .1)",
            border: "1px solid rgb(var(--accent-rgb) / .24)",
          }}
        >
          {copied ? "Link copied — paste it into Safari" : "Or copy the link to paste into Safari"}
        </button>
      )}
    </div>
  );
}
