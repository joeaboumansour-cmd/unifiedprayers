"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { type Lang } from "@/lib/content";
import { playGlimmer, playTick } from "@/lib/glimmer";
import {
  RITE_LABEL,
  buildAgenda,
  buildMonth,
  colourVar,
  dayInfo,
  type CalendarView,
  type Day,
  type Feast,
  type Rite,
} from "@/lib/liturgy";
import { at, dayKey } from "@/lib/liturgy/computus";
import { intlLocale } from "@/lib/locale";
import { rememberedOn, type Remembered } from "@/lib/liturgy/martyrology";
import { readingScript, useReadings } from "@/lib/useReadings";
import { useReadingProgress } from "@/lib/useReadingProgress";
import { ReadingMark } from "@/components/ReadingCards";
import type { Liturgy } from "@/lib/useLiturgy";

const EASE = "cubic-bezier(.22,1,.36,1)";

/** How far ahead the agenda looks. Six weeks — the rest of this season. */
const AGENDA_SPAN = 42;

/**
 * Chrome, not prayer text, but the calendar is the one tab of the four that
 * is neither settings nor an operator surface: it is read, and what it names
 * — feasts, seasons, Sundays — is already bilingual in the data. So these
 * follow the app's language rather than pinning to English the way Settings
 * does.
 */
const T = {
  month: { ar: "الشهر", en: "Month" },
  agenda: { ar: "اللائحة", en: "Agenda" },
  today: { ar: "اليوم", en: "Today" },
  prevMonth: { ar: "الشهر السابق", en: "Previous month" },
  nextMonth: { ar: "الشهر التالي", en: "Next month" },
  week: { ar: "الأسبوع", en: "Week" },
  sundayTitle: { ar: "إنّه يوم الأحد. إلى القداس.", en: "It's Sunday. Go to Mass." },
  sundayBody: {
    ar: "الالتزام الوحيد الذي يحمله الأسبوع فعلًا. وكل ما عداه في هذه الروزنامة دعوة.",
    en: "The one obligation the week actually carries. Everything else on this calendar is an invitation.",
  },
  kept: { ar: "في هذا اليوم", en: "Kept today" },
  alsoKept: { ar: "يُذكر أيضًا", en: "Also commemorated" },
  empty: {
    ar: "لا عيد في هذا اليوم — يوم من أيام الزمن.",
    en: "No feast kept — a weekday of the season.",
  },
  agendaEmpty: {
    ar: "لا شيء في الأسابيع الستة المقبلة.",
    en: "Nothing in the next six weeks.",
  },
  readings: { ar: "قراءات اليوم", en: "Today's readings" },
  readingsSource: { ar: "المصدر", en: "Source" },
  openReading: { ar: "اقرأ", en: "Read" },
  remembered: { ar: "ويُذكر في هذا اليوم أيضًا", en: "Also remembered on this day" },
  rememberedNote: {
    ar: "قدّيسون تحفظهم كنائس أخرى في هذا اليوم. اضغط على الاسم لقراءة سيرته.",
    en: "Saints kept on this day by other churches. Tap a name to read about them.",
  },
  loading: { ar: "لحظة…", en: "One moment…" },
  more: { ar: "أظهر الجميع", en: "Show all" },
} as const;

const sectionLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: "var(--dim-3)",
  marginTop: 6,
  marginBottom: 8,
};

export default function Calendar({
  lang,
  liturgy,
  onOpenRites,
  onOpenFeast,
}: {
  lang: Lang;
  liturgy: Liturgy;
  onOpenRites: () => void;
  onOpenFeast: (feast: Feast, day: Day) => void;
}) {
  const ar = lang === "ar";
  const today = useMemo(() => at(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate(),
  ), []);
  const todayKey = dayKey(today);

  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [agenda, setAgenda] = useState(false);

  const view: CalendarView = {
    rite: liturgy.rite,
    alsoRoman: liturgy.alsoRoman,
    lang,
  };

  const cells = useMemo(
    () => buildMonth(cursor.y, cursor.m, view),
    // The view object is rebuilt every render; its three fields are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cursor.y, cursor.m, liturgy.rite, liturgy.alsoRoman, lang],
  );

  const selected = useMemo(() => {
    const [y, m, d] = selectedKey.split("-").map(Number);
    return dayInfo(at(y, m - 1, d), view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, liturgy.rite, liturgy.alsoRoman, lang]);

  const agendaDays = useMemo(
    () => (agenda ? buildAgenda(today, AGENDA_SPAN, view) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agenda, liturgy.rite, liturgy.alsoRoman, lang, todayKey],
  );

  const monthName = new Intl.DateTimeFormat(intlLocale(lang), { month: "long" })
    .format(at(cursor.y, cursor.m, 1));
  const yearLabel = new Intl.NumberFormat(intlLocale(lang), { useGrouping: false })
    .format(cursor.y);
  const num = new Intl.NumberFormat(intlLocale(lang));

  /** S M T W T F S, starting Sunday, in the reader's language. */
  const dowInitials = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale(lang), { weekday: "narrow" });
    // 4 January 1970 was a Sunday, so this walks a week from Sunday.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(1970, 0, 4 + i)));
  }, [ar]);

  const step = (n: number) => {
    const d = at(cursor.y, cursor.m + n, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  const goToday = () => {
    setCursor({ y: today.getFullYear(), m: today.getMonth() });
    setSelectedKey(todayKey);
  };

  const pick = (cell: (typeof cells)[number]) => {
    setSelectedKey(cell.key);
    // Tapping a spilled-in date is how a thumb moves to the next month.
    if (cell.outside) setCursor({ y: cell.date.getFullYear(), m: cell.date.getMonth() });
  };

  const offMonth = cursor.y !== today.getFullYear() || cursor.m !== today.getMonth();

  return (
    <div>
      {/* ---------------- month nav ----------------
          Left to right in both languages: the left arrow is always the month
          before and the right arrow the month after, the way a wall calendar
          and every phone's date picker work in Arabic too. Mirroring the row
          with the shell put "next" on the left, which is not where an Arabic
          reader reaches for October. */}
      <div
        dir="ltr"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Arrow dir="back" label={T.prevMonth[lang]} onClick={() => step(-1)} />
        <div dir={ar ? "rtl" : "ltr"} style={{ textAlign: "center", lineHeight: 1.15 }}>
          <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-.01em" }}>
            {monthName}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--dim-3)",
              letterSpacing: ".1em",
              marginTop: 2,
            }}
          >
            {yearLabel}
          </div>
        </div>
        <Arrow dir="forward" label={T.nextMonth[lang]} onClick={() => step(1)} />
      </div>

      {/* ---------------- rite chip + view switch ---------------- */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginTop: 14,
        }}
      >
        <button
          type="button"
          onClick={() => {
            onOpenRites();
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            minWidth: 0,
            padding: "7px 12px",
            borderRadius: 999,
            background: "rgb(var(--veil-rgb) / .05)",
            border: "1px solid rgb(var(--veil-rgb) / .08)",
            fontSize: 12.5,
            color: "var(--soft)",
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            style={{ flex: "none" }}
          >
            <path d="M12 3v18M6.5 8.5h11" />
          </svg>
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {RITE_LABEL[liturgy.rite][lang]}
          </span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flex: "none" }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        <div
          style={{
            display: "flex",
            padding: 3,
            borderRadius: 999,
            background: "rgb(var(--veil-rgb) / .05)",
            flex: "none",
          }}
        >
          {[false, true].map((isAgenda) => {
            const on = agenda === isAgenda;
            return (
              <button
                key={String(isAgenda)}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setAgenda(isAgenda);
                }}
                style={{
                  padding: "5px 13px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 500,
                  transition: `background .25s ${EASE}, color .25s ${EASE}, scale var(--t-rise) var(--ease-out)`,
                  background: on ? "rgb(var(--accent-rgb) / .16)" : "transparent",
                  color: on ? "var(--accent-ink)" : "var(--dim-3)",
                }}
              >
                {(isAgenda ? T.agenda : T.month)[lang]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------------- the season ribbon ----------------
          Above the grid rather than in it: the season is the context that
          makes every dot below legible, and it changes four or five times a
          year rather than daily. */}
      <div
        style={{
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "11px 14px",
          borderRadius: 13,
          background:
            "linear-gradient(90deg,rgb(var(--veil-rgb) / .055),rgb(var(--veil-rgb) / .02))",
          border: "1px solid rgb(var(--veil-rgb) / .06)",
          borderInlineStart: `3px solid ${colourVar(selected.season.colour)}`,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--body)", minWidth: 0 }}>
          {selected.season.name}
        </div>
        <div
          style={{
            marginInlineStart: "auto",
            fontSize: 11,
            color: "var(--dim-3)",
            whiteSpace: "nowrap",
          }}
        >
          {T.week[lang]} {num.format(selected.season.week)}
        </div>
      </div>

      {agenda ? (
        <AgendaList
          days={agendaDays}
          lang={lang}
          todayKey={todayKey}
          onOpenFeast={onOpenFeast}
        />
      ) : (
        <>
          {/* ---------------- the grid ---------------- */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7,1fr)",
              marginTop: 18,
            }}
          >
            {dowInitials.map((d, i) => (
              <span
                key={i}
                style={{
                  textAlign: "center",
                  fontSize: 10.5,
                  letterSpacing: ".1em",
                  paddingBottom: 8,
                  color: i === 0 ? "var(--accent-ink)" : "var(--dim-4)",
                }}
              >
                {d}
              </span>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
            {cells.map((c, i) => {
              const isSunday = i % 7 === 0;
              const isToday = c.key === todayKey;
              const isSel = c.key === selectedKey;
              const lastRow = i >= cells.length - 7;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => pick(c)}
                  aria-label={new Intl.DateTimeFormat(intlLocale(lang), {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  }).format(c.date)}
                  aria-current={isToday ? "date" : undefined}
                  style={{
                    height: 50,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    fontVariantNumeric: "tabular-nums",
                    // A faint band the full height of the month, so the shape
                    // of the week reads before a single number does.
                    background: isSunday ? "rgb(var(--accent-rgb) / .05)" : "none",
                    borderStartStartRadius: isSunday && i === 0 ? 12 : 0,
                    borderStartEndRadius: isSunday && i === 0 ? 12 : 0,
                    borderEndStartRadius: isSunday && lastRow ? 12 : 0,
                    borderEndEndRadius: isSunday && lastRow ? 12 : 0,
                  }}
                >
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 14.5,
                      transition: `background .2s ${EASE}, color .2s ${EASE}`,
                      opacity: c.outside ? 0.42 : 1,
                      fontWeight: isToday || (c.high && !c.outside) ? 600 : 400,
                      color: isToday
                        ? "var(--on-accent)"
                        : c.high && !c.outside
                          ? "var(--accent-ink)"
                          : "var(--body)",
                      background: isToday ? "var(--accent)" : "transparent",
                      boxShadow: isSel
                        ? isToday
                          ? "0 0 0 1.5px rgb(var(--bg-base-rgb)),0 0 0 3px var(--accent)"
                          : "inset 0 0 0 1.5px var(--accent)"
                        : "none",
                    }}
                  >
                    {num.format(c.date.getDate())}
                  </span>
                  {/* Three at most. A day that keeps five things still has to
                      fit in a 57px column, and the fourth dot is the one that
                      turns a calendar into a rash. */}
                  <span style={{ display: "flex", gap: 3, height: 5, alignItems: "center" }}>
                    {c.feasts.slice(0, 3).map((f) => (
                      <span
                        key={f.id}
                        style={{
                          width: f.high ? 6 : 5,
                          height: f.high ? 6 : 5,
                          borderRadius: "50%",
                          background: colourVar(f.colour),
                          opacity: c.outside ? 0.4 : 1,
                        }}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          {offMonth && (
            <button
              type="button"
              onClick={goToday}
              style={{
                display: "block",
                margin: "14px auto 0",
                padding: "6px 16px",
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 500,
                color: "var(--accent-ink)",
                background: "rgb(var(--accent-rgb) / .12)",
              }}
            >
              {T.today[lang]}
            </button>
          )}

          <DayDetail
            day={selected}
            rite={liturgy.rite}
            lang={lang}
            isToday={selected.key === todayKey}
            onOpenFeast={onOpenFeast}
          />
        </>
      )}
    </div>
  );
}

/* --------------------------------- pieces -------------------------------- */

function Arrow({
  dir,
  label,
  onClick,
}: {
  dir: "back" | "forward";
  label: string;
  onClick: () => void;
}) {
  // The row is pinned left to right (see the month nav), so back is always
  // the left arrow pointing left and forward the right one pointing right.
  const pointsRight = dir === "forward";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        color: "var(--dim-2)",
        flex: "none",
      }}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transform: pointsRight ? "none" : "scaleX(-1)" }}
      >
        <path d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

/**
 * The selected day.
 *
 * Only one thing on this screen is a filled, lit object and it is the Sunday
 * prompt. Everything else — the mystery set, each feast — is a hairline row.
 * That is the whole hierarchy of the tab: on Sunday the calendar asks
 * something of you, and the other six days it tells you things.
 */
function DayDetail({
  day,
  lang,
  rite,
  isToday,
  onOpenFeast,
}: {
  day: Day;
  lang: Lang;
  /** Whose readings to ask for — nine churches read nine different things. */
  rite: Rite;
  isToday: boolean;
  onOpenFeast: (f: Feast, d: Day) => void;
}) {
  const ar = lang === "ar";
  const dateLine = new Intl.DateTimeFormat(intlLocale(lang), {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(day.date);

  return (
    <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: ".13em",
            textTransform: "uppercase",
            color: day.sunday ? "var(--accent-ink)" : "var(--dim-3)",
          }}
        >
          {dateLine}
          {isToday ? ` · ${T.today[lang]}` : ""}
        </div>
        <div
          style={{
            fontSize: 17,
            fontWeight: 500,
            lineHeight: 1.35,
            marginTop: 5,
            textWrap: "balance",
          }}
        >
          {day.title}
        </div>
      </div>

      {day.sunday && (
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            padding: 18,
            borderRadius: 20,
            background:
              "radial-gradient(120% 130% at 12% 0%,rgb(var(--accent-rgb) / .2),rgb(var(--accent-rgb) / .05) 62%),rgb(var(--veil-rgb) / .035)",
            border: "1px solid rgb(var(--accent-rgb) / .22)",
            display: "flex",
            gap: 13,
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              flex: "none",
              width: 40,
              height: 40,
              borderRadius: 12,
              display: "grid",
              placeItems: "center",
              background: "rgb(var(--accent-rgb) / .16)",
              color: "var(--accent-ink)",
            }}
          >
            <svg
              width="21"
              height="21"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2v4M10 4h4" />
              <path d="M12 6 5 11v10h14V11z" />
              <path d="M10 21v-5h4v5" />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: "-.005em" }}>
              {T.sundayTitle[lang]}
            </div>
            <div
              style={{
                fontSize: 12.8,
                lineHeight: 1.6,
                color: "var(--soft)",
                marginTop: 5,
              }}
            >
              {T.sundayBody[lang]}
            </div>
          </div>
        </div>
      )}

      <div style={sectionLabel}>{(day.sunday ? T.alsoKept : T.kept)[lang]}</div>
      {day.feasts.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--dim-3)", marginTop: -4 }}>
          {T.empty[lang]}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", marginTop: -4 }}>
          {day.feasts.map((f, i) => (
            <FeastRow
              key={f.id}
              feast={f}
              lang={lang}
              last={i === day.feasts.length - 1}
              onClick={() => {
                onOpenFeast(f, day);
              }}
            />
          ))}
        </div>
      )}

      <Readings day={day} lang={lang} rite={rite} isToday={isToday} />
      <Remembrance day={day} lang={lang} />
    </div>
  );
}

/**
 * The passages appointed for the day.
 *
 * The one thing on this screen that comes off the network, and the one thing
 * that is often simply absent — for a date outside the mirror's archive, for
 * the Orthodox rites nothing yet covers, or offline. So it renders nothing at
 * all rather than an apology: the day still has its season, its feasts and its
 * saints, which is what a calendar is for.
 *
 * The attribution is not decoration and is not optional. These are somebody's
 * translation, made by a liturgical commission and served by evangelizo.org,
 * and a reading shown bare is a reading a reader will assume is ours.
 *
 * In the reader's language where the mirror has the day in it; otherwise in
 * whichever it does, set in that language's direction.
 *
 * On today, and only on today, these are the same readings the home and Today
 * screens are keeping score of, so they carry the same ticks and reading one
 * here counts there. Other days are left unticked deliberately: the log is
 * what the streak is counted from, and a tap on last Tuesday is a reader
 * looking a day up, not a reader having read it.
 */
function Readings({
  day,
  lang,
  rite,
  isToday,
}: {
  day: Day;
  lang: Lang;
  rite: Rite;
  isToday: boolean;
}) {
  const { data } = useReadings(day.key, rite, lang);
  const [open, setOpen] = useState<string | null>(null);
  // Which tick to draw itself: the one for the reading opened by this tap,
  // never the ones that were already done when the day was opened.
  const [fresh, setFresh] = useState<string | null>(null);

  const kinds = useMemo(() => (data?.readings ?? []).map((r) => r.kind), [data]);
  const progress = useReadingProgress(day.key, rite, kinds);

  // Collapse again when the reader moves to another day, or the second day
  // they open inherits the first one's expanded passage.
  useEffect(() => {
    setOpen(null);
    setFresh(null);
  }, [day.key, rite]);

  if (!data?.readings.length) return null;

  return (
    <>
      <div style={{ ...sectionLabel, marginTop: 22 }}>{T.readings[lang]}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.readings.map((r) => {
          const isOpen = open === r.kind;
          const script = readingScript(r, data);
          const read = isToday && progress.isRead(r.kind);
          return (
            <div
              key={r.kind}
              style={{
                borderRadius: 14,
                background: read
                  ? "rgb(var(--accent-rgb) / .055)"
                  : "rgb(var(--veil-rgb) / .035)",
                border: `1px solid ${read ? "rgb(var(--accent-rgb) / .18)" : "rgb(var(--veil-rgb) / .07)"}`,
                overflow: "hidden",
                transition: "background .5s var(--ease), border-color .5s var(--ease)",
              }}
            >
              <button
                type="button"
                disabled={!r.text}
                onClick={() => {
                  setOpen(isOpen ? null : r.kind);
                  // Opening it is the whole of reading it, here as on the home
                  // screen; closing it again does not un-read it.
                  if (!isOpen && isToday && !progress.isRead(r.kind)) {
                    setFresh(r.kind);
                    progress.open(r.kind);
                    // The same sound the tick gets on the home screen: same
                    // fact about the same reading, same mark, same sound.
                    playTick();
                  } else if (!isOpen) {
                    playGlimmer(true);
                  }
                }}
                style={{
                  appearance: "none",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "11px 13px",
                  background: "none",
                  border: "none",
                  textAlign: "start",
                  fontFamily: "inherit",
                  cursor: r.text ? "pointer" : "default",
                  color: "var(--body)",
                }}
              >
                {isToday && <ReadingMark read={read} fresh={fresh === r.kind} />}
                <span
                  lang={script.lang}
                  dir={script.dir}
                  style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.5 }}
                >
                  {/* The label the rite itself gives this reading, never one
                      of ours: what sits in a slot differs by church. */}
                  {r.label ?? r.ref}
                </span>
                {r.text && (
                  <span style={{ fontSize: 11, color: "var(--dim-3)", flex: "none" }}>
                    {isOpen ? "−" : "+"}
                  </span>
                )}
              </button>
              {isOpen && r.text && (
                <p
                  className="selectable"
                  lang={script.lang}
                  dir={script.dir}
                  style={{
                    margin: 0,
                    padding: "0 13px 13px",
                    fontSize: 14.5,
                    lineHeight: 1.9,
                    color: "var(--body)",
                    whiteSpace: "pre-line",
                  }}
                >
                  {r.text}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: "var(--dim-4)", lineHeight: 1.6, marginTop: 8 }}>
        {data.translation ? `${data.translation} · ` : ""}
        {T.readingsSource[lang]}: {data.source}
      </div>
    </>
  );
}

/**
 * Everyone else the day belongs to.
 *
 * Below the feasts and visibly quieter than them, because it is a different
 * kind of fact: these are not what this church celebrates today, they are who
 * is remembered today somewhere. Collapsing that distinction would turn a
 * calendar into a list.
 *
 * The table is 380 KB and loads on demand, so the first day a reader opens
 * shows nothing here for a moment and then fills in. There is no spinner: a
 * section that is *extra* should not announce itself as missing before it
 * arrives.
 */
function Remembrance({ day, lang }: { day: Day; lang: Lang }) {
  const [saints, setSaints] = useState<Remembered[] | null>(null);
  const [all, setAll] = useState(false);

  /* What is already on screen above, as one string. A dependency on the array
     itself would re-run this effect on every render the moment somebody drops
     the useMemo that currently makes `day` stable — and each run ends in a
     setState, so that mistake would be an infinite loop rather than a slow
     screen. */
  const above = day.feasts.map((f) => f.name).join("|");

  useEffect(() => {
    let live = true;
    setAll(false);
    // Matched by name, because the two tables share no id: one is hand-written
    // and romcal's, the other is Wikidata's.
    rememberedOn(day.key, lang, above ? above.split("|") : [])
      .then((r) => live && setSaints(r))
      .catch(() => live && setSaints([]));
    return () => {
      live = false;
    };
  }, [day.key, lang, above]);

  if (!saints?.length) return null;
  const shown = all ? saints : saints.slice(0, 6);

  return (
    <>
      <div style={{ ...sectionLabel, marginTop: 22 }}>{T.remembered[lang]}</div>
      <div style={{ fontSize: 12, color: "var(--dim-3)", lineHeight: 1.6, margin: "-2px 0 8px" }}>
        {T.rememberedNote[lang]}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {shown.map((s) => (
          <a
            key={s.link}
            href={s.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: 5,
              padding: "6px 11px",
              borderRadius: 999,
              fontSize: 12.5,
              textDecoration: "none",
              color: "var(--soft)",
              background: "rgb(var(--veil-rgb) / .04)",
              border: "1px solid rgb(var(--veil-rgb) / .07)",
            }}
          >
            {s.name}
            {s.died !== null && (
              // The year they died, which for most of these is the reason the
              // day is theirs at all.
              <span style={{ fontSize: 10.5, color: "var(--dim-4)" }} dir="ltr">
                {s.died < 0 ? `${-s.died} BC` : s.died}
              </span>
            )}
          </a>
        ))}
        {!all && saints.length > shown.length && (
          <button
            type="button"
            onClick={() => setAll(true)}
            style={{
              appearance: "none",
              padding: "6px 11px",
              borderRadius: 999,
              fontSize: 12.5,
              fontFamily: "inherit",
              cursor: "pointer",
              color: "var(--accent-ink)",
              background: "rgb(var(--accent-rgb) / .08)",
              border: "1px solid rgb(var(--accent-rgb) / .2)",
            }}
          >
            {T.more[lang]} · {saints.length - shown.length}
          </button>
        )}
      </div>
    </>
  );
}

/** One feast. The colour rail is the vestment colour, not a decoration. */
function FeastRow({
  feast,
  lang,
  last,
  onClick,
}: {
  feast: Feast;
  lang: Lang;
  last: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "3px 1fr auto",
        gap: 13,
        alignItems: "center",
        width: "100%",
        textAlign: "start",
        padding: "12px 0",
        borderBottom: last ? "none" : "1px solid rgb(var(--veil-rgb) / .05)",
      }}
    >
      <span
        style={{
          height: 26,
          borderRadius: 2,
          background: colourVar(feast.colour),
        }}
      />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, lineHeight: 1.35, color: "var(--ink)" }}>
          {feast.name}
        </span>
        <span
          style={{
            display: "block",
            fontSize: 11.5,
            color: "var(--dim-3)",
            marginTop: 3,
          }}
        >
          {feast.borrowed ? RITE_LABEL.roman[lang] : ""}
        </span>
      </span>
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--dim-4)" }}
      >
        <path d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

/**
 * Six weeks ahead, as a list.
 *
 * The grid answers "what is this month shaped like"; this answers "what is
 * coming". Only Sundays and days that keep something appear — an empty
 * Tuesday is a gap, and listing it would bury the days that are not.
 */
function AgendaList({
  days,
  lang,
  todayKey,
  onOpenFeast,
}: {
  days: Day[];
  lang: Lang;
  todayKey: string;
  onOpenFeast: (f: Feast, d: Day) => void;
}) {
  const ar = lang === "ar";
  const num = new Intl.NumberFormat(intlLocale(lang));
  const dow = new Intl.DateTimeFormat(intlLocale(lang), { weekday: "short" });

  if (days.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "var(--dim-3)", marginTop: 22 }}>
        {T.agendaEmpty[lang]}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 18 }}>
      {days.map((day) => (
        <div
          key={day.key}
          style={{
            display: "grid",
            gridTemplateColumns: "46px 1fr",
            gap: 12,
            padding: "13px 0",
            borderTop: "1px solid rgb(var(--veil-rgb) / .055)",
            background: day.sunday ? "rgb(var(--accent-rgb) / .045)" : "none",
            borderRadius: day.sunday ? 10 : 0,
            paddingInline: day.sunday ? 8 : 0,
            marginInline: day.sunday ? -8 : 0,
          }}
        >
          <div style={{ textAlign: "center", paddingTop: 1 }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: ".08em",
                color: day.sunday ? "var(--accent-ink)" : "var(--dim-4)",
              }}
            >
              {dow.format(day.date)}
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 500,
                fontVariantNumeric: "tabular-nums",
                color: day.key === todayKey ? "var(--accent-ink)" : "var(--body)",
              }}
            >
              {num.format(day.date.getDate())}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
            {day.sunday && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "3px 1fr",
                  gap: 11,
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    height: "100%",
                    minHeight: 18,
                    borderRadius: 2,
                    background: "var(--accent)",
                  }}
                />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, color: "var(--accent-ink)" }}>
                    {day.title}
                  </span>
                </span>
              </div>
            )}
            {day.feasts.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onOpenFeast(f, day)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "3px 1fr",
                  gap: 11,
                  alignItems: "center",
                  width: "100%",
                  textAlign: "start",
                }}
              >
                <span
                  style={{
                    height: "100%",
                    minHeight: 18,
                    borderRadius: 2,
                    background: colourVar(f.colour),
                  }}
                />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, color: "var(--ink)" }}>
                    {f.name}
                  </span>
                  {f.borrowed && (
                    <span style={{ display: "block", fontSize: 11, color: "var(--dim-3)" }}>
                      {RITE_LABEL.roman[lang]}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
