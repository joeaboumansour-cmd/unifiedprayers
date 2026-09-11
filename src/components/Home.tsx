"use client";

import dynamic from "next/dynamic";
import type { CSSProperties, ReactNode } from "react";
import AccountCard from "@/components/AccountCard";
import Calendar from "@/components/Calendar";
import DevotionCards, { TrackGlyph } from "@/components/DevotionCards";
import ReadingCards, { readingsEmpty, readingsLabel } from "@/components/ReadingCards";
import RosaryIcon, { IconPlate } from "@/components/RosaryIcon";
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
  type PrayerId,
  setForDay,
  setLabel,
  styleLabel,
  styles,
  ui,
} from "@/lib/content";
import type { Day, Feast } from "@/lib/liturgy";
import { formatNum, intlLocale } from "@/lib/locale";
import type { Stats } from "@/lib/sessions";
import type { AnnouncementRow, DevotionTrack } from "@/lib/supabase/types";
import type { Auth } from "@/lib/useAuth";
import { TRACKS, type Devotions } from "@/lib/useDevotions";
import type { SyncStatus } from "@/lib/useCloudSync";
import type { Liturgy } from "@/lib/useLiturgy";
import type { ReadingsState } from "@/lib/useReadings";
import type { ReadingProgress } from "@/lib/useReadingProgress";
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
  const d = formatNum(n, "ar");
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
  /** Which prayer `activeName` and `progress` describe. Picks its art. */
  prayer: PrayerId;
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
  /** Today's page from each devotional book, and what has been read. */
  devotions: Devotions;
  /** Which church's year the Calendar tab keeps, and the setters for it. */
  liturgy: Liturgy;
  /** Today's readings for the reader's own church, and how far through them. */
  readings: ReadingsState;
  readingProgress: ReadingProgress;
  /** Half of a couple. Draws the couples devotion card unlocked. */
  paired: boolean;
  banner: AnnouncementRow | null;
  onDismissBanner: () => void;
  onToggleLang: () => void;
  onSetLang: (l: Lang) => void;
  onResume: () => void;
  onOpenSpirit: () => void;
  onOpenSheet: () => void;
  onStartToday: () => void;
  onOpenDevotion: (track: DevotionTrack) => void;
  /** Opens the church picker over the app. */
  onOpenRites: () => void;
  /** Opens one feast from the calendar. */
  onOpenFeast: (feast: Feast, day: Day) => void;
  /**
   * The app's own haptic, already gated on the setting. Passed down rather
   * than re-derived so the calendar's taps feel like every other tap.
   */
  onHaptic: (ms?: number) => void;
  /** The locked couples card was tapped. Opens the pairing sheet. */
  onOpenCouple: () => void;
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
  prayer,
  beadStyle,
  palette,
  size,
  toggles,
  auth,
  syncStatus,
  isAdmin,
  push,
  verse,
  devotions,
  liturgy,
  readings,
  readingProgress,
  paired,
  banner,
  onDismissBanner,
  onToggleLang,
  onSetLang,
  onResume,
  onOpenSpirit,
  onOpenSheet,
  onStartToday,
  onOpenDevotion,
  onOpenRites,
  onOpenFeast,
  onHaptic,
  onOpenCouple,
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
  /* Whether there is a prayer to go back to. `progress` is the current step
     over the total, and page.tsx resets the step both on a fresh launch with
     no stored progress and after a prayer is completed — so "> 0" is exactly
     "started and not finished". */
  const started = progress > 0;
  /* Devotions opened today and put down part-way, in book order. Together with
     the prayer above they make the resume list: everything begun and not
     finished, in one place, and nothing else. */
  const halfRead = TRACKS.map((track, i) => ({
    track,
    label: t.devotion.tracks[i],
    state: devotions.stateOf(track),
  })).filter(
    (x) =>
      devotions.isUnfinished(x.track) &&
      // Unlinking mid-read would otherwise leave a card offering to continue a
      // page the database will no longer return.
      Boolean(devotions.byTrack[x.track]),
  );
  const anyResumable = started || halfRead.length > 0;

  // Arabic-Indic digits beside the Arabic date line, Latin ones beside English.
  const num = new Intl.NumberFormat(intlLocale(lang));

  const dateLine = new Intl.DateTimeFormat(intlLocale(lang), {
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

          {/* Everything begun and not finished, in one stack and in one
              shape. A chaplet and a devotion are different lengths and
              different kinds of reading, but "you left this part-way through"
              is the same offer either way, so they are the same card: plate,
              what it is, how far in, and the fraction. Two designs here would
              read as two unrelated features rather than one list.

              Only what was actually left part-way — a card offering to
              continue something at 0% is offering nothing — and the whole
              stack is gone on a first launch and again once everything is
              finished, which is what puts the prayer list at the top of the
              screen for someone with nothing outstanding. */}
          {anyResumable && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                marginBottom: 26,
              }}
            >
              {[
                ...(started
                  ? [
                      {
                        key: "prayer",
                        icon: <RosaryIcon prayer={prayer} size={44} />,
                        kicker: t.resumeKicker,
                        name: activeName,
                        frac: progress,
                        onClick: onResume,
                      },
                    ]
                  : []),
                ...halfRead.map(({ track, label, state }) => ({
                  key: track,
                  icon: (
                    <IconPlate size={44}>
                      <TrackGlyph track={track} lit />
                    </IconPlate>
                  ),
                  kicker: t.devotion.resume,
                  name: label,
                  // Blocks past the first over blocks left to uncover: the
                  // title is on screen before the first tap, so counting it
                  // would start every devotion at something above zero.
                  frac:
                    state && state.total > 1
                      ? (state.shown - 1) / (state.total - 1)
                      : 0,
                  onClick: () => onOpenDevotion(track),
                })),
              ].map((item, i) => (
                <Row
                  key={item.key}
                  onClick={item.onClick}
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    borderRadius: 22,
                    /* The card is the rim. Its one pixel of padding is the only
                       part of the spinning conic gradient below that is left
                       uncovered by the face laid over it. */
                    padding: 1,
                    background: "rgb(var(--veil-rgb) / .09)",
                    animation: `resumeBreathe 5.5s ease-in-out ${i * 0.7}s infinite`,
                  }}
                >
                  {/* The travelling light. Square and larger than the card's
                      diagonal, so a corner is never briefly uncovered as it
                      turns. Placed by the physical `left`, not the logical
                      start: the keyframes centre it with translate(-50%),
                      which is physical too, and in Arabic a logical start
                      put it off the card entirely. */}
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      width: "180%",
                      aspectRatio: "1",
                      background:
                        "conic-gradient(from 0deg, transparent 0deg, transparent 250deg, rgb(var(--accent-rgb) / .5) 300deg, var(--accent-glow) 330deg, rgb(var(--accent-rgb) / .5) 350deg, transparent 360deg)",
                      animation: `resumeSpin 6s linear ${i * -1.6}s infinite`,
                      pointerEvents: "none",
                    }}
                  />
                  <div
                    style={{
                      position: "relative",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: 15,
                      borderRadius: 21,
                      background:
                        "linear-gradient(150deg,var(--resume-a),var(--resume-b))",
                      // The face is opaque over the spinner behind it; the
                      // gradient stops above are translucent, so the ground
                      // goes under them.
                      backgroundColor: "var(--surface)",
                    }}
                  >
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: -70,
                      insetInlineStart: -40,
                      width: 180,
                      height: 180,
                      borderRadius: "50%",
                      background:
                        "radial-gradient(circle,rgb(var(--accent-rgb) / .26),rgb(var(--accent-rgb) / 0) 70%)",
                      pointerEvents: "none",
                    }}
                  />
                  {/* The sheen. Staggered per card so a stack of two does not
                      flash in unison. Physical `left` for the same reason as
                      the light above: its keyframes move it in physical px. */}
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: 0,
                      width: "45%",
                      background:
                        "linear-gradient(90deg,transparent,rgb(var(--veil-rgb) / .16),transparent)",
                      animation: `resumeSheen 7s ease-in-out ${i * 2.2}s infinite`,
                      pointerEvents: "none",
                    }}
                  />
                  <div style={{ position: "relative", flex: "none" }}>
                    {item.icon}
                  </div>
                  <div
                    style={{
                      position: "relative",
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 500,
                        letterSpacing: ".12em",
                        textTransform: "uppercase",
                        color: "var(--accent-ink)",
                      }}
                    >
                      {item.kicker}
                    </div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        lineHeight: 1.3,
                        // One line: the stack is a list of things to get back
                        // to, and a wrapping title turns it into a wall.
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.name}
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
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
                            width: `${(item.frac * 100).toFixed(1)}%`,
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
                        {Math.round(item.frac * 100)}%
                      </div>
                    </div>
                  </div>
                  </div>
                </Row>
              ))}
            </div>
          )}

          <div style={sectionLabel}>{t.devotion.label}</div>
          <div style={{ marginBottom: 26 }}>
            <DevotionCards
              lang={lang}
              devotions={devotions}
              paired={paired}
              onOpen={onOpenDevotion}
              onLocked={onOpenCouple}
            />
          </div>

          <div style={sectionLabel}>{readingsLabel(lang)}</div>
          <div style={{ marginBottom: 26 }}>
            {readings.data?.readings.length ? (
              <ReadingCards
                readings={readings.data.readings}
                progress={readingProgress}
                lang={lang}
                textLang={readings.data.lang}
                translation={readings.data.translation}
                source={readings.data.source}
              />
            ) : (
              /* Nothing yet for this day in this church — the mirror has not
                 reached it, or no source covers that rite. Said plainly rather
                 than left as a gap, because the section heading is already
                 promising something. */
              <div style={{ fontSize: 13, color: "var(--dim-3)", lineHeight: 1.7 }}>
                {readingsEmpty(lang)}
              </div>
            )}
          </div>


          <div style={sectionLabel}>{t.libraryLabel}</div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {[
              {
                glyph: <RosaryIcon prayer="spirit" />,
                name: t.spiritName,
                meta: t.spiritMeta,
                onClick: onOpenSpirit,
              },
              {
                glyph: <RosaryIcon prayer="mary" />,
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

          <div style={sectionLabel}>{t.devotion.label}</div>
          <div style={{ marginBottom: 26 }}>
            <DevotionCards
              lang={lang}
              devotions={devotions}
              paired={paired}
              onOpen={onOpenDevotion}
              onLocked={onOpenCouple}
            />
          </div>

          <div style={sectionLabel}>{readingsLabel(lang)}</div>
          <div style={{ marginBottom: 26 }}>
            {readings.data?.readings.length ? (
              <ReadingCards
                readings={readings.data.readings}
                progress={readingProgress}
                lang={lang}
                textLang={readings.data.lang}
                translation={readings.data.translation}
                source={readings.data.source}
              />
            ) : (
              /* Nothing yet for this day in this church — the mirror has not
                 reached it, or no source covers that rite. Said plainly rather
                 than left as a gap, because the section heading is already
                 promising something. */
              <div style={{ fontSize: 13, color: "var(--dim-3)", lineHeight: 1.7 }}>
                {readingsEmpty(lang)}
              </div>
            )}
          </div>


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

      {/* ---------- CALENDAR ---------- */}
      {tab === 2 && (
        <Calendar
          lang={lang}
          liturgy={liturgy}
          onOpenRites={onOpenRites}
          onOpenFeast={onOpenFeast}
          onHaptic={onHaptic}
        />
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
