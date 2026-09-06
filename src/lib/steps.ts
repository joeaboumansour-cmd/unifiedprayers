import {
  GLORY,
  HAIL,
  type Lang,
  type MysteryKey,
  type PrayerId,
  SET_LABEL,
  marySet,
  maryPost,
  maryPre,
  spirit,
} from "./content";

/**
 * One screen in the player. Every tap advances exactly one step, so the
 * whole rosary is a flat list built once per (prayer, language, set).
 */
export type Step = {
  kind: "text" | "bead";
  title: string;
  text: string;
  counter: string;
  /** Small label above the title: the section of the rosary you are in. */
  kicker: string;
  /** Which decade/gift, and which bead inside it — bead steps only. */
  unit?: number;
  bead?: number;
  units?: number;
  beadsPerUnit?: number;
};

function spiritSteps(lang: Lang): Step[] {
  const ar = lang === "ar";
  const d = spirit(lang);
  const out: Step[] = [];

  d.intro.forEach((p, i) =>
    p.sections.forEach((s, j) =>
      out.push({
        kind: "text",
        title: p.name,
        text: s,
        counter: ar
          ? `التمهيد ${i + 1} · ${j + 1}/${p.sections.length}`
          : `Opening ${i + 1} · ${j + 1}/${p.sections.length}`,
        kicker: ar ? "التمهيد" : "Opening",
      }),
    ),
  );

  d.gifts.forEach((g, gi) => {
    for (let b = 0; b < 8; b++) {
      out.push({
        kind: "bead",
        unit: gi,
        bead: b,
        units: 7,
        beadsPerUnit: 8,
        title: ar ? `موهبة ${g.name}` : `Gift of ${g.name}`,
        text: b === 0 ? g.super : b === 7 ? d.gloryText : d.beadText,
        counter: ar
          ? `موهبة ${gi + 1}/7 · حبة ${b + 1}/8`
          : `Gift ${gi + 1}/7 · Bead ${b + 1}/8`,
        kicker: ar ? "المواهب السبع" : "The seven gifts",
      });
    }
  });

  d.closing.forEach((p) =>
    p.sections.forEach((s, j) =>
      out.push({
        kind: "text",
        title: p.name,
        text: s,
        counter: ar
          ? `الختام · ${j + 1}/${p.sections.length}`
          : `Closing · ${j + 1}/${p.sections.length}`,
        kicker: ar ? "الختام" : "Closing",
      }),
    ),
  );

  return out;
}

function marySteps(lang: Lang, key: MysteryKey): Step[] {
  const ar = lang === "ar";
  const pre = maryPre(lang);
  const set = marySet(key, lang);
  const post = maryPost(lang);
  const out: Step[] = [];
  const openKicker = ar ? "التمهيد" : "Opening";

  if (set?.offering) {
    out.push({
      kind: "text",
      title: ar ? "التقدمة" : "The Offering",
      text: set.offering,
      counter: ar ? "التقدمة" : "Offering",
      kicker: openKicker,
    });
  }

  pre.forEach((p, i) =>
    p.sections.forEach((s) =>
      out.push({
        kind: "text",
        title: p.name,
        text: s,
        counter: ar
          ? `التمهيد ${i + 1}/${pre.length}`
          : `Opening ${i + 1}/${pre.length}`,
        kicker: openKicker,
      }),
    ),
  );

  (set?.mysteries ?? []).forEach((m, mi) => {
    const kicker = SET_LABEL[lang][key];
    const fruitLine = m.fruit
      ? ar
        ? `\nثمرة السر: ${m.fruit}`
        : `\nFruit of the mystery: ${m.fruit}`
      : "";

    out.push({
      kind: "text",
      title: m.name,
      text: (m.offering || "") + fruitLine,
      counter: ar ? `السر ${mi + 1}/5` : `Mystery ${mi + 1}/5`,
      kicker,
    });

    (m.meditation ?? []).forEach((s, j) =>
      out.push({
        kind: "text",
        title: m.name,
        text: s,
        counter: ar
          ? `تأمّل ${j + 1}/${m.meditation!.length}`
          : `Meditation ${j + 1}/${m.meditation!.length}`,
        kicker,
      }),
    );

    for (let b = 0; b < 12; b++) {
      const text = b === 0 ? m.super : b === 11 ? GLORY[lang] : HAIL[lang];
      const label =
        b === 0
          ? ar
            ? "أبانا الذي في السماوات"
            : "Our Father"
          : b === 11
            ? ar
              ? "المجد للآب"
              : "Glory Be"
            : ar
              ? "السلام عليك يا مريم"
              : "Hail Mary";
      out.push({
        kind: "bead",
        unit: mi,
        bead: b,
        units: 5,
        beadsPerUnit: 12,
        title: label,
        text,
        counter: ar
          ? `السر ${mi + 1}/5 · حبة ${b + 1}/12`
          : `Mystery ${mi + 1}/5 · Bead ${b + 1}/12`,
        kicker: m.name,
      });
    }
  });

  post.forEach((p) =>
    p.sections.forEach((s, j) =>
      out.push({
        kind: "text",
        title: p.name,
        text: s,
        counter: ar
          ? `الختام · ${j + 1}/${p.sections.length}`
          : `Closing · ${j + 1}/${p.sections.length}`,
        kicker: ar ? "الختام" : "Closing",
      }),
    ),
  );

  return out;
}

export function buildSteps(
  prayer: PrayerId,
  lang: Lang,
  key: MysteryKey,
): Step[] {
  return prayer === "mary" ? marySteps(lang, key) : spiritSteps(lang);
}

/** Bead positions for the four visual styles, in each SVG's own viewBox. */
export type Bead = {
  x: number;
  y: number;
  r: number;
  fill: string;
  opacity: number;
  glow: boolean;
  /** Diameter used by the dot-grid "orb" style. */
  dot: number;
  dotBg: string;
};

export function beadGeometry(
  step: Step | undefined,
  style: BeadStyleName,
  prayer: PrayerId,
): Bead[] {
  const n =
    step?.kind === "bead"
      ? (step.beadsPerUnit ?? 8)
      : prayer === "mary"
        ? 12
        : 8;
  const active = step?.kind === "bead" ? (step.bead ?? -1) : -1;
  const beads: Bead[] = [];

  for (let i = 0; i < n; i++) {
    let x = 0;
    let y = 0;
    if (style === "ring") {
      const a = ((-90 + i * (360 / n)) * Math.PI) / 180;
      x = 200 + 118 * Math.cos(a);
      y = 150 + 118 * Math.sin(a);
    } else if (style === "chain") {
      x = 24 + i * (352 / (n - 1));
      y = 45;
    } else {
      const a = ((200 + i * (140 / (n - 1))) * Math.PI) / 180;
      x = 200 + 175 * Math.cos(a);
      y = 220 + 175 * Math.sin(a);
    }

    const isActive = i === active;
    const done = active > i;
    beads.push({
      x: Number(x.toFixed(1)),
      y: Number(y.toFixed(1)),
      r: isActive ? (style === "chain" ? 9 : 11) : i === 0 ? 7 : 5.5,
      fill: isActive ? "url(#upActive)" : done ? "#f0c775" : "#dbe2f5",
      opacity: active < 0 ? 0.2 : isActive ? 1 : done ? 0.75 : 0.34,
      glow: isActive,
      dot: isActive ? 13 : 8,
      dotBg: isActive
        ? "#f0c775"
        : done
          ? "rgba(240,199,117,.6)"
          : "rgba(219,226,245,.5)",
    });
  }
  return beads;
}

export type BeadStyleName = "arc" | "ring" | "chain" | "orb";

/** Length of the progress stroke for each style's path. */
export const DASH_LENGTH: Record<BeadStyleName, number> = {
  arc: 427.6,
  ring: 741.4,
  chain: 352,
  orb: 427.6,
};
