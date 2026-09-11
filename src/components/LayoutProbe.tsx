"use client";

import { useEffect, useState } from "react";

/**
 * What the device says about its own screen, on request.
 *
 * iOS home-screen apps sometimes lay the page out in a viewport shorter than
 * the screen, leaving a dead strip under the tab bar, and whether it happens
 * depends on the iOS version and the launch. Fixing it by guessing pushed the
 * tab labels off the bottom edge. This reads the actual numbers instead — the
 * screen, the viewports, the viewport units, the safe areas, and where the
 * app, the tab bar and its labels really end — so a screenshot of it says
 * what the fix must be.
 *
 * Hidden: five taps on the version line in Settings opens it.
 */

type Row = [string, string];

function measure(): Row[] {
  const px = (n: number) => `${Math.round(n * 10) / 10}`;
  const probe = (css: string) => {
    const el = document.createElement("div");
    el.style.cssText = `position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none;${css}`;
    document.body.appendChild(el);
    const r = el.getBoundingClientRect();
    // Read while attached: a detached element's computed style is empty.
    const cs = getComputedStyle(el);
    const pad = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(" ");
    el.remove();
    return { h: r.height, pad };
  };
  const fixedFull = probe("bottom:0").h;
  const units = ["100vh", "100svh", "100lvh", "100dvh", "100%"]
    .map((u) => `${u}=${px(probe(`height:${u}`).h)}`)
    .join("  ");
  const safe = probe(
    "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)",
  ).pad;
  const rect = (sel: string) => {
    const el = document.querySelector(sel);
    if (!el) return "—";
    const r = el.getBoundingClientRect();
    return `top ${px(r.top)} bottom ${px(r.bottom)} h ${px(r.height)}`;
  };
  const vv = window.visualViewport;
  const nav = document.querySelector("nav");
  const label = nav?.querySelector("button span");
  const n = navigator as Navigator & { standalone?: boolean };

  return [
    ["standalone", `${n.standalone === true} / display-mode ${matchMedia("(display-mode: standalone)").matches}`],
    ["screen", `${screen.width} × ${screen.height} @${devicePixelRatio}x`],
    ["inner", `${innerWidth} × ${innerHeight}`],
    ["docElement", `${document.documentElement.clientWidth} × ${document.documentElement.clientHeight}`],
    ["visualVP", vv ? `${px(vv.width)} × ${px(vv.height)} offTop ${px(vv.offsetTop)}` : "—"],
    ["fixed 0/0", px(fixedFull)],
    ["units", units],
    ["safe t/r/b/l", safe],
    ["body", rect("body")],
    ["app-shell", rect(".app-shell")],
    ["nav", rect("nav")],
    ["nav label", label ? `bottom ${px(label.getBoundingClientRect().bottom)}` : "—"],
    ["html data-ios", String("ios" in document.documentElement.dataset)],
    ["ua", navigator.userAgent.replace(/^Mozilla\/5\.0 /, "").slice(0, 120)],
  ];
}

/**
 * The About row in Settings, drawn as it always was — five quick taps on it
 * open the diagnostics beneath it, five more close them.
 */
export function AboutRow({ about, version }: { about: string; version: string }) {
  const [taps, setTaps] = useState<number[]>([]);
  const [open, setOpen] = useState(false);

  const tap = () => {
    const now = Date.now();
    const recent = [...taps.filter((t) => now - t < 2000), now];
    if (recent.length >= 5) {
      setOpen((o) => !o);
      setTaps([]);
    } else {
      setTaps(recent);
    }
  };

  return (
    <>
      <div
        onClick={tap}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "15px 16px",
          borderRadius: 18,
          background: "rgb(var(--veil-rgb) / .03)",
          border: "1px solid rgb(var(--veil-rgb) / .06)",
          marginTop: 26,
        }}
      >
        <div style={{ fontSize: 13.5, color: "var(--soft)" }}>{about}</div>
        <div style={{ fontSize: 12, color: "var(--dim-3)" }}>{version}</div>
      </div>
      <LayoutProbe open={open} />
    </>
  );
}

export default function LayoutProbe({ open }: { open: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!open) return;
    const update = () => setRows(measure());
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    const t = window.setInterval(update, 1500);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.clearInterval(t);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      dir="ltr"
      className="selectable"
      style={{
        marginTop: 12,
        padding: 14,
        borderRadius: 16,
        background: "rgb(var(--veil-rgb) / .04)",
        border: "1px solid rgb(var(--veil-rgb) / .1)",
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 11,
        lineHeight: 1.6,
        color: "var(--soft)",
        wordBreak: "break-word",
      }}
    >
      <div style={{ fontFamily: "inherit", color: "var(--accent-ink)", marginBottom: 6 }}>
        Layout diagnostics — screenshot this
      </div>
      {rows.map(([k, v]) => (
        <div key={k}>
          <span style={{ color: "var(--dim-3)" }}>{k}: </span>
          {v}
        </div>
      ))}
    </div>
  );
}
