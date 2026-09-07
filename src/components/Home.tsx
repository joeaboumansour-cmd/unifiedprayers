"use client";

import dynamic from "next/dynamic";
import type { CSSProperties, ReactNode } from "react";
import AccountCard from "@/components/AccountCard";
import { AnnouncementBanner } from "@/components/Announcements";
import NotificationsCard from "@/components/NotificationsCard";
import SignUpBanner from "@/components/SignUpBanner";
import {
  PALETTES,
  PALETTE_LABEL,
  type BeadStyle,
  type Lang,
  type MysteryKey,
  type Palette,
  setForDay,
  setLabel,
  styleLabel,
  styles,
  ui,
} from "@/lib/content";
import type { Stats } from "@/lib/sessions";
import type { AnnouncementRow } from "@/lib/supabase/types";
import type { Auth } from "@/lib/useAuth";
import type { SyncStatus } from "@/lib/useCloudSync";
import type { Push } from "@/lib/usePush";
import type { Verse } from "@/lib/useVerse";

/** The admin tab's own name. Chrome, not prayer text — so not in design.json. */
const ADMIN_LABEL = { ar: "الإدارة", en: "Admin" } as const;

/**
 * Four editor panels, their forms and their bilingual copy, fetched only by the
 * one or two accounts that can open them. Everyone else is here to pray, and
 * this is an offline-first app whose first load is the thing being protected —
 * shipping an admin console inside it to every visitor would be paying for a
 * screen almost nobody can see.
 *
 * `ssr: false` because the tab renders only after the admin check resolves,
 * which needs the session, which the server render does not have.
 */
const AdminTab = dynamic(() => import("@/components/admin/AdminTab"), {
  ssr: false,
});

const EASE = "cubic-bezier(.22,1,.36,1)";
const GOLD = "var(--accent)";

/**
 * Arabic counts in more than two shapes, so a bare `${n} days` is wrong for
 * most numbers. Zero is not a streak at all and reads as an invitation.
 */
function streakLine(n: number, ar: boolean): string {
  if (!ar) {
    if (n === 0) return "Start your streak today";
    return n === 1 ? "1 day of prayer in a row" : `${n} days of prayer in a row`;
  }
  const d = new Intl.NumberFormat("ar").format(n);
  if (n === 0) return "ابدأ سلسلتك اليوم";
  if (n === 1) return "يوم واحد متتالٍ من الصلاة";
  if (n === 2) return "يومان متتاليان من الصلاة";
  if (n <= 10) return `${d} أيام متتالية من الصلاة`;
  return `${d} يومًا متتاليًا من الصلاة`;
}

const sectionLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: "var(--dim-2)",
  marginBottom: 12,
};

const card: CSSProperties = {
  borderRadius: 18,
  background: "rgb(var(--veil-rgb) / .045)",
  border: "1px solid rgb(var(--veil-rgb) / .07)",
};

function Row({
  children,
  onClick,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  return (
    <div
      onClick={onClick}
      className={onClick ? "tap" : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{ cursor: onClick ? "pointer" : "default", ...style }}
    >
      {children}
    </div>
  );
}

/** The small rosary glyphs on the two prayer rows. */
function SpiritGlyph() {
  const pale = (o: number) => `rgb(var(--ink-rgb) / ${o})`;
  return (
    <svg viewBox="0 0 44 44" style={{ width: 42, height: 42, flex: "none" }}>
      <circle cx="22" cy="22" r="19" fill="none" stroke="rgb(var(--accent-rgb) / .22)" />
      <circle cx="22" cy="3.4" r="2.6" fill={GOLD} />
      <circle cx="35.4" cy="9.9" r="1.9" fill={pale(0.8)} />
      <circle cx="40.4" cy="22" r="1.9" fill={pale(0.55)} />
      <circle cx="35.4" cy="34.1" r="1.9" fill={pale(0.4)} />
      <circle cx="22" cy="40.6" r="1.9" fill={pale(0.3)} />
      <circle cx="8.6" cy="34.1" r="1.9" fill={pale(0.4)} />
      <circle cx="3.6" cy="22" r="1.9" fill={pale(0.55)} />
      <circle cx="8.6" cy="9.9" r="1.9" fill={pale(0.8)} />
    </svg>
  );
}

function MaryGlyph() {
  const pale = (o: number) => `rgb(var(--ink-rgb) / ${o})`;
  return (
    <svg viewBox="0 0 44 44" style={{ width: 42, height: 42, flex: "none" }}>
      <path d="M6 34 A18 18 0 0 1 38 34" fill="none" stroke="rgb(var(--accent-rgb) / .22)" />
      <circle cx="22" cy="16.2" r="2.6" fill={GOLD} />
      <circle cx="11.2" cy="21.6" r="1.9" fill={pale(0.7)} />
      <circle cx="32.8" cy="21.6" r="1.9" fill={pale(0.7)} />
      <circle cx="6.6" cy="30.5" r="1.9" fill={pale(0.45)} />
      <circle cx="37.4" cy="30.5" r="1.9" fill={pale(0.45)} />
    </svg>
  );
}

/** Miniature previews for the bead-style picker. */
function StyleGlyph({ kind, ink }: { kind: BeadStyle; ink: string }) {
  const track = "rgb(var(--veil-rgb) / .14)";
  const body = {
    arc: (
      <g>
        <path d="M14 46 A46 46 0 0 1 106 46" fill="none" stroke={track} />
        {[
          [14, 46, 2.6],
          [21.5, 30.6, 2.6],
          [37.4, 17.4, 2.6],
          [60, 12, 4],
          [82.6, 17.4, 2.6],
          [98.5, 30.6, 2.6],
          [106, 46, 2.6],
        ].map(([cx, cy, r], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill={ink} />
        ))}
      </g>
    ),
    ring: (
      <g>
        <circle cx="60" cy="28" r="20" fill="none" stroke={track} />
        {[
          [60, 8, 3.6],
          [74.1, 13.9, 2.4],
          [80, 28, 2.4],
          [74.1, 42.1, 2.4],
          [60, 48, 2.4],
          [45.9, 42.1, 2.4],
          [40, 28, 2.4],
          [45.9, 13.9, 2.4],
        ].map(([cx, cy, r], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill={ink} />
        ))}
      </g>
    ),
    chain: (
      <g>
        <path d="M12 28 H108" stroke={track} />
        {[16, 31, 46, 61, 76, 91, 106].map((cx, i) => (
          <circle key={i} cx={cx} cy={28} r={cx === 61 ? 5 : 2.6} fill={ink} />
        ))}
      </g>
    ),
    orb: (
      <g>
        <circle cx="60" cy="24" r="14" fill={ink} opacity=".3" />
        <circle cx="60" cy="24" r="8" fill={ink} />
        {[42, 51, 60, 69, 78].map((cx, i) => (
          <circle
            key={i}
            cx={cx}
            cy={48}
            r={2}
            fill={ink}
            opacity={cx === 60 ? 1 : 0.5}
          />
        ))}
      </g>
    ),
  }[kind];

  return (
    <svg viewBox="0 0 120 56" style={{ width: "100%", height: 44 }}>
      {body}
    </svg>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <div
      style={{
        flex: "none",
        width: 46,
        height: 28,
        borderRadius: 999,
        padding: 3,
        boxSizing: "border-box",
        transition: "background .3s ease",
        background: on ? "rgb(var(--accent-rgb) / .85)" : "rgb(var(--veil-rgb) / .14)",
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "var(--switch-knob)",
          transition: `transform .3s ${EASE}`,
          transform: on ? "translateX(var(--knob))" : "translateX(0)",
        }}
      />
    </div>
  );
}

export type HomeProps = {
  hidden: boolean;
  tab: number;
  lang: Lang;
  /** Real counts from the device's log of finished prayers. */
  stats: Stats;
  progress: number;
  activeName: string;
  mysterySet: MysteryKey;
  beadStyle: BeadStyle;
  palette: Palette;
  size: number;
  toggles: boolean[];
  auth: Auth;
  syncStatus: SyncStatus;
  /** Adds the fifth tab. Every button in it is checked again server-side. */
  isAdmin: boolean;
  push: Push;
  /** Today's verse from the database, or null to use the bundled one. */
  verse: Verse | null;
  banner: AnnouncementRow | null;
  onDismissBanner: () => void;
  onToggleLang: () => void;
  onSetLang: (l: Lang) => void;
  onResume: () => void;
  onOpenSpirit: () => void;
  onOpenSheet: () => void;
  onStartToday: () => void;
  onSetStyle: (s: BeadStyle) => void;
  onSetPalette: (p: Palette) => void;
  onSetSize: (i: number) => void;
  onToggle: (i: number) => void;
};

export default function Home({
  hidden,
  tab,
  lang,
  stats,
  progress,
  activeName,
  beadStyle,
  palette,
  size,
  toggles,
  auth,
  syncStatus,
  isAdmin,
  push,
  verse,
  banner,
  onDismissBanner,
  onToggleLang,
  onSetLang,
  onResume,
  onOpenSpirit,
  onOpenSheet,
  onStartToday,
  onSetStyle,
  onSetPalette,
  onSetSize,
  onToggle,
}: HomeProps) {
  const t = ui(lang);
  const ar = lang === "ar";
  // Settings and Admin are English whatever the app language is: they are
  // account and operator surfaces rather than prayer text, and one fixed
  // wording keeps them unambiguous. Their subtrees also carry dir="ltr", since
  // the shell around them mirrors in Arabic, and re-pin --knob, which the root
  // sets to travel the mirrored way.
  const tEn = ui("en");
  const enOnly = tab === 3 || tab === 4;
  const today = new Date();
  const hour = today.getHours();
  const greet = hour < 5 ? 0 : hour < 12 ? 1 : hour < 17 ? 2 : 3;
  const todaySet = setForDay(today.getDay());

  // Arabic-Indic digits beside the Arabic date line, Latin ones beside English.
  const num = new Intl.NumberFormat(ar ? "ar" : "en");

  const dateLine = new Intl.DateTimeFormat(ar ? "ar" : "en", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(today);

  const pill = (active: boolean): CSSProperties => ({
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12.5,
    fontWeight: 500,
    transition: "background .25s ease",
    background: active ? "rgb(var(--accent-rgb) / .9)" : "transparent",
    color: active ? "var(--on-accent)" : "var(--soft)",
  });

  return (
    <div
      className="scroll-y"
      style={{
        position: "absolute",
        inset: 0,
        padding:
          "calc(20px + var(--safe-t)) 20px var(--tab-clear)",
        boxSizing: "border-box",
        transition: `transform .5s ${EASE}, opacity .4s ease`,
        transform: hidden ? "scale(.965)" : "scale(1)",
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? "none" : "auto",
        // Keeps the knob travel correct when the layout mirrors.
        ["--knob" as string]: ar ? "-18px" : "18px",
      }}
      aria-hidden={hidden}
    >
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 5,
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: 13, color: "var(--dim)" }}>{dateLine}</div>
          <div
            style={{
              fontSize: 25,
              fontWeight: 600,
              lineHeight: 1.25,
              letterSpacing: "-.01em",
            }}
          >
            {tab === 0
              ? t.greeting[greet]
              : enOnly
                ? (tEn.pages[tab] ?? ADMIN_LABEL.en)
                : (t.pages[tab] ?? ADMIN_LABEL[lang])}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleLang}
          style={{
            flex: "none",
            display: "flex",
            alignItems: "center",
            height: 34,
            padding: "0 13px",
            borderRadius: 999,
            background: "rgb(var(--veil-rgb) / .06)",
            border: "1px solid rgb(var(--veil-rgb) / .09)",
            fontSize: 12.5,
            fontWeight: 500,
            color: "var(--soft-2)",
            backdropFilter: "blur(12px)",
          }}
        >
          {t.langSwap}
        </button>
      </div>

      {/* ---------- PRAYERS ---------- */}
      {tab === 0 && (
        <div>
          {banner && (
            <AnnouncementBanner
              row={banner}
              lang={lang}
              onDismiss={onDismissBanner}
            />
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "13px 15px",
              borderRadius: 18,
              background:
                "linear-gradient(135deg,rgb(var(--accent-rgb) / .1),rgb(var(--accent-rgb) / .03))",
              border: "1px solid rgb(var(--accent-rgb) / .16)",
              marginBottom: 14,
            }}
          >
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {Array.from({ length: 7 }, (_, i) => (
                <div
                  key={i}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: stats.week[i]
                      ? GOLD
                      : "rgb(var(--accent-rgb) / .22)",
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--accent-text)", lineHeight: 1.5 }}>
              {streakLine(stats.streak, ar)}
            </div>
          </div>

          <SignUpBanner auth={auth} />

          <Row
            onClick={onResume}
            style={{
              position: "relative",
              overflow: "hidden",
              borderRadius: 24,
              padding: 20,
              marginBottom: 26,
              background:
                "linear-gradient(150deg,var(--resume-a),var(--resume-b))",
              border: "1px solid rgb(var(--veil-rgb) / .09)",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -70,
                insetInlineStart: -40,
                width: 190,
                height: 190,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle,rgb(var(--accent-rgb) / .3),rgb(var(--accent-rgb) / 0) 70%)",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: ".12em",
                  textTransform: "uppercase",
                  color: "var(--accent-ink)",
                }}
              >
                {t.resumeKicker}
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.35 }}>
                {activeName}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    flex: 1,
                    height: 3,
                    borderRadius: 999,
                    background: "rgb(var(--veil-rgb) / .12)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      borderRadius: 999,
                      background: `linear-gradient(90deg,${GOLD},var(--accent-soft))`,
                      transition: `width .6s ${EASE}`,
                      width: `${(progress * 100).toFixed(1)}%`,
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--soft)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {Math.round(progress * 100)}%
                </div>
              </div>
            </div>
          </Row>

          <div style={sectionLabel}>{t.libraryLabel}</div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginBottom: 26,
            }}
          >
            {[
              {
                glyph: <SpiritGlyph />,
                name: t.spiritName,
                meta: t.spiritMeta,
                onClick: onOpenSpirit,
              },
              {
                glyph: <MaryGlyph />,
                name: t.maryName,
                meta: t.maryMeta,
                onClick: onOpenSheet,
              },
            ].map((r) => (
              <Row
                key={r.name}
                onClick={r.onClick}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: 14,
                  ...card,
                }}
              >
                {r.glyph}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: 15.5, fontWeight: 500 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: "var(--dim)" }}>{r.meta}</div>
                </div>
              </Row>
            ))}
          </div>

          <div style={sectionLabel}>{t.comingLabel}</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            {t.coming.map((name) => (
              <div
                key={name}
                style={{
                  padding: "15px 14px",
                  borderRadius: 16,
                  background: "rgb(var(--veil-rgb) / .028)",
                  border: "1px solid rgb(var(--veil-rgb) / .05)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  minHeight: 78,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    border: "1px solid rgb(var(--accent-rgb) / .35)",
                    background: "rgb(var(--accent-rgb) / .07)",
                  }}
                />
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 500,
                    color: "var(--soft)",
                    lineHeight: 1.35,
                  }}
                >
                  {name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------- TODAY ---------- */}
      {tab === 1 && (
        <div>
          <Row
            onClick={onStartToday}
            style={{
              position: "relative",
              overflow: "hidden",
              borderRadius: 24,
              padding: "22px 20px",
              marginBottom: 18,
              background:
                "linear-gradient(150deg,rgb(var(--accent-rgb) / .16),var(--resume-b))",
              border: "1px solid rgb(var(--accent-rgb) / .2)",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -80,
                insetInlineEnd: -50,
                width: 200,
                height: 200,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle,rgb(var(--accent-soft-rgb) / .28),rgb(var(--accent-rgb) / 0) 70%)",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: ".12em",
                  textTransform: "uppercase",
                  color: "var(--accent-ink)",
                }}
              >
                {t.todayKicker}
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.3 }}>
                {setLabel(lang, todaySet)}
              </div>
              <div style={{ fontSize: 13, color: "var(--soft-2)", lineHeight: 1.7 }}>
                {t.todaySetHint}
              </div>
            </div>
          </Row>

          <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
            {[stats.streak, stats.monthPrayers, stats.monthMinutes].map((n, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  padding: "15px 12px",
                  borderRadius: 18,
                  background: "rgb(var(--veil-rgb) / .04)",
                  border: "1px solid rgb(var(--veil-rgb) / .07)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    color: "var(--accent-ink)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {num.format(n)}
                </div>
                <div
                  style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.4 }}
                >
                  {t.statLabels[i]}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              padding: 18,
              borderRadius: 20,
              background: "rgb(var(--veil-rgb) / .035)",
              border: "1px solid rgb(var(--veil-rgb) / .06)",
              marginBottom: 18,
            }}
          >
            <div style={{ ...sectionLabel, letterSpacing: ".08em", marginBottom: 14 }}>
              {t.thisWeek}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 6,
              }}
            >
              {t.days.map((label, i) => {
                const day = today.getDay();
                const done = i < day;
                return (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      flex: 1,
                    }}
                  >
                    <div style={{ fontSize: 10.5, color: "var(--dim-3)" }}>
                      {label}
                    </div>
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background:
                          i === day
                            ? "rgb(var(--accent-rgb) / .16)"
                            : "rgb(var(--veil-rgb) / .03)",
                        border: `1px solid ${
                          i === day
                            ? "rgb(var(--accent-rgb) / .45)"
                            : "rgb(var(--veil-rgb) / .07)"
                        }`,
                      }}
                    >
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background:
                            done || i === day
                              ? GOLD
                              : "rgb(var(--veil-rgb) / .12)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            style={{
              padding: 18,
              borderRadius: 20,
              background: "rgb(var(--veil-rgb) / .035)",
              border: "1px solid rgb(var(--veil-rgb) / .06)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ ...sectionLabel, letterSpacing: ".08em", marginBottom: 0 }}>
              {t.verseLabel}
            </div>
            <div
              className="selectable"
              style={{ fontSize: 16, lineHeight: 1.9, color: "var(--body)" }}
            >
              {/* The bundled verse is the fallback, not the default: it is what
                  shows before anyone has added one, and offline on a device
                  that has never fetched the list. */}
              {verse?.text ?? t.verse}
            </div>
            <div style={{ fontSize: 12, color: "var(--dim)" }}>
              {verse ? verse.ref : t.verseRef}
            </div>
          </div>
        </div>
      )}

      {/* ---------- LIBRARY ---------- */}
      {tab === 2 && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              height: 42,
              padding: "0 14px",
              borderRadius: 14,
              background: "rgb(var(--veil-rgb) / .05)",
              border: "1px solid rgb(var(--veil-rgb) / .08)",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                border: "1.5px solid var(--dim-3)",
                flex: "none",
              }}
            />
            <div style={{ fontSize: 13.5, color: "var(--dim-3)" }}>{t.search}</div>
          </div>

          {[
            {
              title: t.groups[0],
              items: [
                { name: t.spiritName, meta: t.spiritMeta, ready: true, onClick: onOpenSpirit },
                { name: t.maryName, meta: t.maryMeta, ready: true, onClick: onOpenSheet },
              ],
            },
            {
              title: t.groups[1],
              items: t.coming.map((n) => ({
                name: n,
                meta: t.soon,
                ready: false,
                onClick: undefined,
              })),
            },
          ].map((g) => (
            <div key={g.title} style={{ marginBottom: 22 }}>
              <div style={sectionLabel}>{g.title}</div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                {g.items.map((it) => (
                  <Row
                    key={it.name}
                    onClick={it.onClick}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "15px 16px",
                      borderRadius: 16,
                      background: it.ready
                        ? "rgb(var(--veil-rgb) / .045)"
                        : "rgb(var(--veil-rgb) / .022)",
                      border: "1px solid rgb(var(--veil-rgb) / .06)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 500,
                          color: it.ready ? "var(--ink)" : "var(--dim)",
                        }}
                      >
                        {it.name}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--dim-3)" }}>
                        {it.meta}
                      </div>
                    </div>
                    {it.ready && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--accent-ink)",
                          padding: "4px 9px",
                          borderRadius: 999,
                          background: "rgb(var(--accent-rgb) / .12)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {ar ? "جاهزة" : "Ready"}
                      </div>
                    )}
                  </Row>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- SETTINGS ---------- */}
      {tab === 3 && (
        <div dir="ltr" style={{ ["--knob" as string]: "18px" }}>
          <div style={sectionLabel}>{PALETTE_LABEL.en}</div>
          {/* One control split down the middle, dark on one side and light on
              the other. Each half is painted in its OWN palette rather than
              the running one, so the control shows what the tap will do
              instead of describing it. */}
          <div
            role="group"
            aria-label={PALETTE_LABEL.en}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              borderRadius: 18,
              overflow: "hidden",
              /* The frame is drawn in the live accent, not in the neutral
                 hairline the other cards use, so the box belongs to the
                 selection inside it rather than sitting around it. */
              border: "1px solid rgb(var(--accent-rgb) / .3)",
              boxShadow: "0 0 0 3px rgb(var(--accent-rgb) / .06)",
              transition: "border-color .25s ease, box-shadow .25s ease",
              marginBottom: 26,
            }}
          >
            {PALETTES.map((p) => {
              const on = p.id === palette;
              return (
                <Row
                  key={p.id}
                  onClick={() => onSetPalette(p.id)}
                  style={{
                    padding: "19px 12px 15px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 9,
                    alignItems: "center",
                    // The accent glows out of the top of its own ground.
                    background: `radial-gradient(130% 100% at 50% -15%, ${p.swatch}33 0%, ${p.ground} 62%)`,
                    /* Neither half is faded: fading one would wash it toward
                       the page it is NOT, and then it previews nothing. The
                       chosen side is marked by the rule under its name, and
                       by its accent and label coming up to full strength. */
                    transition: "background .25s ease",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: on ? p.swatch : `${p.swatch}88`,
                      boxShadow: on ? `0 2px 12px ${p.swatch}66` : "none",
                      transition: "background .25s ease",
                    }}
                  />
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: on ? 600 : 500,
                      // Readable on this half's ground, not on the app's.
                      color: on ? p.ink : `${p.ink}b0`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.label.en}
                  </span>
                  {/* The mark of the choice: a short rule in this half's own
                      accent. It holds its width either way so the two names
                      stay on the same line. */}
                  <span
                    aria-hidden="true"
                    style={{
                      width: 22,
                      height: 2,
                      borderRadius: 999,
                      background: p.swatch,
                      opacity: on ? 1 : 0,
                      transition: "opacity .25s ease",
                    }}
                  />
                </Row>
              );
            })}
          </div>

          <div style={sectionLabel}>{tEn.beadStyleLabel}</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginBottom: 26,
            }}
          >
            {styles().map((k) => {
              const on = k === beadStyle;
              return (
                <Row
                  key={k}
                  onClick={() => onSetStyle(k)}
                  style={{
                    padding: "14px 12px 12px",
                    borderRadius: 18,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    alignItems: "center",
                    transition: "background .25s ease,border-color .25s ease",
                    background: on
                      ? "rgb(var(--accent-rgb) / .12)"
                      : "rgb(var(--veil-rgb) / .035)",
                    border: `1px solid ${
                      on ? "rgb(var(--accent-rgb) / .45)" : "rgb(var(--veil-rgb) / .07)"
                    }`,
                  }}
                >
                  <StyleGlyph
                    kind={k}
                    ink={on ? GOLD : "rgb(var(--bead-rgb) / .55)"}
                  />
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: on ? "var(--accent-ink)" : "var(--soft)",
                    }}
                  >
                    {styleLabel("en", k)}
                  </div>
                </Row>
              );
            })}
          </div>

          <div style={sectionLabel}>{tEn.readingLabel}</div>
          <div
            style={{
              borderRadius: 18,
              background: "rgb(var(--veil-rgb) / .04)",
              border: "1px solid rgb(var(--veil-rgb) / .07)",
              overflow: "hidden",
              marginBottom: 26,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "15px 16px",
                borderBottom: "1px solid rgb(var(--veil-rgb) / .05)",
              }}
            >
              <div style={{ fontSize: 14.5 }}>{tEn.textSize}</div>
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  padding: 3,
                  borderRadius: 999,
                  background: "var(--well)",
                }}
              >
                {tEn.sizes.map((label, i) => (
                  <Row
                    key={label}
                    onClick={() => onSetSize(i)}
                    style={{ ...pill(size === i), minWidth: 38, textAlign: "center" }}
                  >
                    {label}
                  </Row>
                ))}
              </div>
            </div>

            {tEn.toggles.map(([name, hint], i) => (
              <Row
                key={name}
                onClick={() => onToggle(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "15px 16px",
                  borderBottom: "1px solid rgb(var(--veil-rgb) / .05)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: 14.5 }}>{name}</div>
                  <div
                    style={{ fontSize: 11.5, color: "var(--dim-3)", lineHeight: 1.4 }}
                  >
                    {hint}
                  </div>
                </div>
                <Toggle on={toggles[i]} />
              </Row>
            ))}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "15px 16px",
              }}
            >
              <div style={{ fontSize: 14.5 }}>{tEn.language}</div>
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  padding: 3,
                  borderRadius: 999,
                  background: "var(--well)",
                }}
              >
                {(["ar", "en"] as Lang[]).map((l) => (
                  <Row
                    key={l}
                    onClick={() => onSetLang(l)}
                    style={pill(lang === l)}
                  >
                    {l === "ar" ? "العربية" : "English"}
                  </Row>
                ))}
              </div>
            </div>
          </div>

          <AccountCard lang="en" auth={auth} syncStatus={syncStatus} />

          <div style={{ marginTop: 26 }}>
            <NotificationsCard lang="en" push={push} />
          </div>

          <div
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
            <div style={{ fontSize: 13.5, color: "var(--soft)" }}>{tEn.about}</div>
            <div style={{ fontSize: 12, color: "var(--dim-3)" }}>{tEn.version}</div>
          </div>
        </div>
      )}

      {/* ---------- ADMIN ---------- */}
      {/* Guarded twice over: the tab bar only offers this index to an admin,
          and the panel is only mounted for one. */}
      {tab === 4 && isAdmin && (
        <div dir="ltr" style={{ ["--knob" as string]: "17px" }}>
          <AdminTab lang="en" />
        </div>
      )}
    </div>
  );
}
