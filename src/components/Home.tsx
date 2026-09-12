"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import AccountCard from "@/components/AccountCard";
import Calendar from "@/components/Calendar";
import DailyVerseCard from "@/components/DailyVerseCard";
import DevotionCards, { TrackGlyph } from "@/components/DevotionCards";
import Friends from "@/components/Friends";
import { AboutRow } from "@/components/LayoutProbe";
import ReadingCards, {
  ReadingsWaiting,
  readingsEmpty,
  readingsLabel,
} from "@/components/ReadingCards";
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
import type { Friends as FriendsState, FriendsError } from "@/lib/useFriends";
import { TRACKS, type Devotions } from "@/lib/useDevotions";
import type { SyncStatus } from "@/lib/useCloudSync";
import type { Liturgy } from "@/lib/useLiturgy";
import type { DailyVerseState } from "@/lib/useDailyVerse";
import type { ReadingsState } from "@/lib/useReadings";
import type { ReadingProgress } from "@/lib/useReadingProgress";
import type { TabSwipe } from "@/lib/useTabSwipe";
import type { Push } from "@/lib/usePush";

/**
 * The names of the pages the content document does not know about.
 *
 * `UI.pages` in design.json is [Prayers, Today, Calendar, Settings] and the
 * live copy of that document is edited in Supabase, not in this bundle — so
 * once Friends took index 3, indexing that array by tab number started
 * answering "Settings" for the Friends page, and would keep doing so however
 * the bundled JSON were edited.
 *
 * These three are chrome rather than prayer text and are English in both
 * languages (see `enOnly` below), so naming them here rather than in the
 * document costs nothing and cannot drift.
 */
const CHROME_TITLES: Record<number, string> = {
  3: "Friends",
  4: "Settings",
  5: "Admin",
};

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
 * Which of the content document's `toggles` rows Settings draws, by their
 * place in that list: [night mode, haptics, ambient sound, keep awake].
 *
 * Night mode is not here because it belongs to the prayer — it has its own
 * button in the player, where somebody praying in the dark actually is — and
 * haptics is gone altogether: iOS offers a web page no reliable way to buzz.
 * The labels stay in the content document untouched, since the live copy of
 * it is edited in Supabase and not in this bundle.
 */
const SETTINGS_TOGGLES = [2, 3] as const;

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
  /** The sideways drag across the pages. Held by the shell, which also owns
      `tab` and hands the same gesture to the tab bar. */
  swipe: TabSwipe;
  /** Counts taps on the tab already open. Each one sends that page to the
      top; counted rather than flagged so two in a row are two requests. */
  home: number;
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
  /** On/off for each row in SETTINGS_TOGGLES, in that order. */
  toggles: boolean[];
  auth: Auth;
  syncStatus: SyncStatus;
  /** Adds the fifth tab. Every button in it is checked again server-side. */
  isAdmin: boolean;
  push: Push;
  /** Today's page from each devotional book, and what has been read. */
  devotions: Devotions;
  /** Which church's year the Calendar tab keeps, and the setters for it. */
  liturgy: Liturgy;
  /** Today's readings for the reader's own church, and how far through them. */
  readings: ReadingsState;
  readingProgress: ReadingProgress;
  /** This device's daily verse, and whether the app was opened from it. */
  dailyVerse: DailyVerseState;
  /** Half of a couple. Draws the couples devotion card unlocked. */
  paired: boolean;
  /** The Friends page's whole state, and everything that changes it. */
  friends: FriendsState;
  /**
   * An invitation link that was tapped, and how redeeming it went. Owned by
   * the shell: the code arrives in the URL before this page is built, and has
   * to survive a trip through sign-in.
   */
  pendingInvite: string | null;
  inviteResult: { error: FriendsError | null } | null;
  onAcceptInvite: () => void;
  onDismissInvite: () => void;
  /** Takes the reader to the sign-in screen. */
  onSignIn: () => void;
  /** Whether friends may see this account's streak. Settings draws the switch. */
  shareActivity: boolean;
  onToggleShareActivity: () => void;
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
  swipe,
  home,
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
  devotions,
  liturgy,
  readings,
  readingProgress,
  dailyVerse,
  paired,
  friends,
  pendingInvite,
  inviteResult,
  onAcceptInvite,
  onDismissInvite,
  onSignIn,
  shareActivity,
  onToggleShareActivity,
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
  // Friends, Settings and Admin. Friends joins them because it is an account
  // surface too — the names on it are whatever people typed, and a page that
  // mirrored its layout around them would be picking a direction for content
  // it cannot read.
  const enOnly = (i: number) => i >= 3;
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

  // Prayers, Today, Calendar, Friends, Settings — and Admin for those who have
  // it. Must stay in step with the tab bar's own list and with useTabSwipe.
  const count = isAdmin ? 6 : 5;

  /* Tapping the tab you are already on takes that page back to the top.
     Now that each page keeps its own scroll position, the long ones stay
     where they were left — which is what you want every time except the one
     time you are a long way down and just want to be back at the start. The
     tab under your thumb is the obvious way to ask for that, and on a phone
     it is the only one that does not involve a lot of scrolling.

     `home` counts the taps rather than naming the tab, so two in a row on the
     same tab are two separate requests. */
  const pane = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    if (!home) return;
    pane.current[tab]?.scrollTo({
      top: 0,
      /* The one place a long, eased motion is right on a direct tap: this is
         travel, and cutting straight to the top loses where you came from.
         Unless the reader has asked for less of it, in which case a long
         glide past everything they scrolled through is the whole of what
         they were asking to be spared. */
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [home, tab]);

  /* Which pages are built. A page you can reach with the next swipe has to be
     there already or there would be nothing to slide in, so the two either
     side of the current one are kept alive — and once built a page stays,
     because it is holding its own scroll position and, for the calendar, the
     day it went and fetched. Settings and Admin are therefore never built for
     a reader who only ever opens the first three. */
  const [live, setLive] = useState<number[]>(() => [tab]);
  useEffect(() => {
    setLive((was) => {
      const want = [tab - 1, tab, tab + 1].filter((i) => i >= 0 && i < count);
      const missing = want.filter((i) => !was.includes(i));
      return missing.length ? [...was, ...missing] : was;
    });
  }, [tab, count]);

  /* A tap that skips a tab should not fly the pages between it past the
     reader: three pages of travel reads as a journey rather than a change of
     place. Everything next door — every swipe, and a tap on a neighbour —
     slides.

     Decided the moment the tab changes and then held, rather than derived from
     a ref each render: the answer has to survive the re-renders that follow
     one tab change, and a ref updated in an effect is already stale by the
     second of them. Setting state during a render is the supported way to
     adjust to a changed prop — React re-runs this render before it paints. */
  const [motion, setMotion] = useState({ tab, near: true });
  if (motion.tab !== tab) {
    setMotion({ tab, near: Math.abs(tab - motion.tab) <= 1 });
  }

  /** One page, built for whichever tab it is. */
  const page = (i: number) => (
    <>
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
            {i === 0
              ? t.greeting[greet]
              : enOnly(i)
                ? CHROME_TITLES[i]
                : (t.pages[i] ?? "")}
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
      {i === 0 && (
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
            ) : readings.loading ? (
              /* Still asking. Not the same thing as the day having none, and
                 the sentence below says exactly that — so for the second the
                 fetch takes it would be telling the reader something untrue. */
              <ReadingsWaiting />
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
      {i === 1 && (
        <div>
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

          {/* The one thing on this tab chosen for this reader, and where the
              morning notification lands — it scrolls here on arrival. */}
          <DailyVerseCard lang={lang} daily={dailyVerse} />

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
            ) : readings.loading ? (
              /* Still asking. Not the same thing as the day having none, and
                 the sentence below says exactly that — so for the second the
                 fetch takes it would be telling the reader something untrue. */
              <ReadingsWaiting />
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
        </div>
      )}

      {/* ---------- CALENDAR ---------- */}
      {i === 2 && (
        <Calendar
          lang={lang}
          liturgy={liturgy}
          onOpenRites={onOpenRites}
          onOpenFeast={onOpenFeast}
        />
      )}

      {/* ---------- FRIENDS ---------- */}
      {i === 3 && (
        <div dir="ltr">
          <Friends
            friends={friends}
            signedIn={auth.status === "signed-in"}
            pendingInvite={pendingInvite}
            inviteResult={inviteResult}
            onAcceptInvite={onAcceptInvite}
            onDismissInvite={onDismissInvite}
            onSignIn={onSignIn}
          />
        </div>
      )}

      {/* ---------- SETTINGS ---------- */}
      {i === 4 && (
        <div dir="ltr" style={{ ["--knob" as string]: "18px" }}>
          <div style={sectionLabel}>{PALETTE_LABEL.en}</div>
          {/* One control divided into a column per palette. Each column is
              painted in its OWN palette rather than the running one, so the
              control shows what the tap will do instead of describing it. */}
          <div
            role="group"
            aria-label={PALETTE_LABEL.en}
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${PALETTES.length}, 1fr)`,
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

            {SETTINGS_TOGGLES.map((row) => tEn.toggles[row]).map(([name, hint], i) => (
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

            {/* Lives here rather than on the Friends page because it is a
                setting about this account, and because somebody looking to
                turn it off looks in Settings. Only drawn for an account —
                signed out there are no friends to be visible to. */}
            {auth.status === "signed-in" && (
              <Row
                onClick={onToggleShareActivity}
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
                  style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}
                >
                  <div style={{ fontSize: 14.5 }}>Share activity with friends</div>
                  <div style={{ fontSize: 11.5, color: "var(--dim-3)", lineHeight: 1.4 }}>
                    Your streak and whether you prayed today. Never what or when.
                  </div>
                </div>
                <Toggle on={shareActivity} />
              </Row>
            )}

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

          {/* Five taps open the layout diagnostics — see LayoutProbe. */}
          <AboutRow about={tEn.about} version={tEn.version} />
        </div>
      )}

      {/* ---------- ADMIN ---------- */}
      {/* Guarded twice over: the tab bar only offers this index to an admin,
          and the panel is only mounted for one. */}
      {i === 5 && isAdmin && (
        <div dir="ltr" style={{ ["--knob" as string]: "17px" }}>
          <AdminTab lang="en" />
        </div>
      )}
    </>
  );

  return (
    <div
      /* Left to right in both languages, and this is the one that matters.
         The track inside is `count * 100%` wide — far wider than this box —
         and an overflowing child is laid out from its parent's inline start.
         Inheriting `rtl` from the shell put that start on the RIGHT, so the
         track hung off the left edge by its whole overflow (a 5-page track in
         a 375px window began at -1500px) and `translateX(-tab …)` then moved
         it further away. Every page sat off-screen and the app painted as an
         empty gradient in Arabic.
         The track already declares `dir="ltr"`, but that governs the order of
         the panes *inside* it, never where the track itself is placed — only
         this element can decide that. Nothing else here reads the direction:
         each pane sets its own below, and --knob is a length, not a flow. */
      dir="ltr"
      style={{
        position: "absolute",
        inset: 0,
        /* `clip` rather than `hidden`: a hidden box is still scrollable by
           script, and one scrollIntoView deep inside a page — the morning
           notification lands on one — would shove the whole track sideways
           and leave it there with no way back. A clipped box cannot scroll. */
        overflow: "clip",
        transition: `transform .5s ${EASE}, opacity .4s ease`,
        transform: hidden ? "scale(.965)" : "scale(1)",
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? "none" : "auto",
        // Keeps the knob travel correct when the layout mirrors.
        ["--knob" as string]: ar ? "-18px" : "18px",
      }}
      aria-hidden={hidden}
      {...swipe.handlers}
    >
      <div
        /* Left to right in both languages, like the tab bar and for the same
           reason: these pages are in that bar's order, and an order that
           reversed with the language would make one habit into two. */
        dir="ltr"
        style={{
          display: "flex",
          height: "100%",
          width: `${count * 100}%`,
          // The percentage is of the track, which is `count` pages wide, so
          // one page is 100/count of it.
          transform: `translateX(calc(${(-tab * 100) / count}% + ${swipe.offset}px))`,
          transition: swipe.dragging || !motion.near ? "none" : `transform .42s ${EASE}`,
        }}
      >
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            ref={(el) => {
              pane.current[i] = el;
            }}
            className="scroll-y"
            dir={ar ? "rtl" : "ltr"}
            style={{
              width: `${100 / count}%`,
              height: "100%",
              padding: "calc(20px + var(--safe-t)) 20px var(--tab-clear)",
              boxSizing: "border-box",
              // Up and down stays the browser's, which does it far better than
              // script can; everything sideways belongs to the swipe.
              touchAction: "pan-y",
            }}
            aria-hidden={i !== tab}
          >
            {live.includes(i) && page(i)}
          </div>
        ))}
      </div>
    </div>
  );
}
