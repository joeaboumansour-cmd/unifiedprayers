"use client";

/* TEMPORARY diagnostic overlay for the iOS tab-bar offset. Delete once the
   bottom-inset question is settled. */

import { useEffect, useState } from "react";

function readInsets() {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;" +
    "padding-top:env(safe-area-inset-top,0px);" +
    "padding-bottom:env(safe-area-inset-bottom,0px);" +
    "padding-left:env(safe-area-inset-left,0px);" +
    "padding-right:env(safe-area-inset-right,0px);";
  document.body.appendChild(probe);
  const s = getComputedStyle(probe);
  const out = {
    t: s.paddingTop,
    b: s.paddingBottom,
    l: s.paddingLeft,
    r: s.paddingRight,
  };
  probe.remove();
  return out;
}

export default function SafeDebug() {
  const [open, setOpen] = useState(true);
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    const sample = () => {
      const ins = readInsets();
      const vv = window.visualViewport;
      const nav = document.querySelector("nav");
      const navRect = nav?.getBoundingClientRect();
      const navPadBottom = nav ? getComputedStyle(nav).paddingBottom : "-";
      const shell = document.querySelector(".app-shell");
      const shellRect = shell?.getBoundingClientRect();
      const safeB = getComputedStyle(document.documentElement)
        .getPropertyValue("--safe-b")
        .trim();
      const standalone = window.matchMedia("(display-mode: standalone)").matches;

      setLines([
        `inner ${window.innerWidth}x${window.innerHeight} dpr${window.devicePixelRatio}`,
        `screen ${window.screen.width}x${window.screen.height}`,
        `vv ${vv ? `${Math.round(vv.width)}x${Math.round(vv.height)} top${Math.round(vv.offsetTop)} sc${vv.scale}` : "-"}`,
        `env t${ins.t} b${ins.b} l${ins.l} r${ins.r}`,
        `--safe-b ${safeB || "(empty)"}`,
        `standalone ${standalone} navStandalone ${String((navigator as Navigator & { standalone?: boolean }).standalone)}`,
        `shell top${shellRect ? Math.round(shellRect.top) : "-"} h${shellRect ? Math.round(shellRect.height) : "-"} bot${shellRect ? Math.round(shellRect.bottom) : "-"}`,
        `nav top${navRect ? Math.round(navRect.top) : "-"} h${navRect ? Math.round(navRect.height) : "-"} bot${navRect ? Math.round(navRect.bottom) : "-"}`,
        `nav padB ${navPadBottom}`,
        `gap below nav ${navRect ? Math.round(window.innerHeight - navRect.bottom) : "-"}`,
      ]);
    };

    sample();
    const id = window.setInterval(sample, 700);
    window.visualViewport?.addEventListener("resize", sample);
    window.addEventListener("resize", sample);
    return () => {
      window.clearInterval(id);
      window.visualViewport?.removeEventListener("resize", sample);
      window.removeEventListener("resize", sample);
    };
  }, []);

  return (
    <div
      dir="ltr"
      onClick={() => setOpen((v) => !v)}
      style={{
        position: "fixed",
        left: 6,
        top: 6,
        zIndex: 99999,
        maxWidth: "94vw",
        padding: open ? "6px 8px" : "4px 7px",
        borderRadius: 8,
        background: "rgba(0,0,0,.82)",
        border: "1px solid rgba(255,255,255,.25)",
        color: "#7CFC9A",
        font: "10px/1.35 ui-monospace,Menlo,monospace",
        whiteSpace: "pre",
        pointerEvents: "auto",
      }}
    >
      {open ? lines.join("\n") : "dbg"}
    </div>
  );
}
