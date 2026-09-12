"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnnouncementModal } from "@/components/Announcements";
import Home from "@/components/Home";
import CoupleSheet from "@/components/CoupleSheet";
import DevotionReader from "@/components/DevotionReader";
import FeastSheet from "@/components/FeastSheet";
import LaunchSplash from "@/components/LaunchSplash";
import MysterySheet from "@/components/MysterySheet";
import NotificationsPrompt from "@/components/NotificationsPrompt";
import Player from "@/components/Player";
import RiteSheet from "@/components/RiteSheet";
import TabBar from "@/components/TabBar";
import {
  type MysteryKey,
  type PrayerId,
  paletteInfo,
  setForDay,
  ui,
} from "@/lib/content";
import {
  DEFAULT_PREFS,
  PREFS_KEY,
  PROGRESS_KEY,
  type Prefs,
  type Progress,
  isFresh,
  readPrefs,
  readProgress,
  writeLocal,
} from "@/lib/state";
import type { Day, Feast } from "@/lib/liturgy";
import { intlLocale } from "@/lib/locale";
import type { DevotionTrack } from "@/lib/supabase/types";
import { setAppBusy } from "@/lib/appBusy";
import { watchAudioUnlock } from "@/lib/audio";
import { playChime } from "@/lib/chime";
import { playPageTurn, preloadSfx } from "@/lib/sfx";
import { buildSteps } from "@/lib/steps";
import { useAdmin } from "@/lib/useAdmin";
import { useAmbience } from "@/lib/useAmbience";
import { useAnnouncements } from "@/lib/useAnnouncements";
import { useAuth } from "@/lib/useAuth";
import { useCloudSync } from "@/lib/useCloudSync";
import { usePush } from "@/lib/usePush";
import { useRemoteContent } from "@/lib/useRemoteContent";
import { useStats } from "@/lib/useStats";
import { useStrayAuthToken } from "@/lib/useStrayAuthToken";
import { useCouple } from "@/lib/useCouple";
import { type FriendsError, useFriends } from "@/lib/useFriends";
import { useProfile } from "@/lib/useProfile";
import { useLiturgy } from "@/lib/useLiturgy";
import { useDailyVerse } from "@/lib/useDailyVerse";
import { useReadings } from "@/lib/useReadings";
import { useReadingProgress } from "@/lib/useReadingProgress";
import { useTabSwipe } from "@/lib/useTabSwipe";
import { TRACKS, useDevotions } from "@/lib/useDevotions";
import { useWakeLock } from "@/lib/useWakeLock";

/** Where a `?friend=` code waits while the visitor goes off to sign in. */
const INVITE_KEY = "up.invite";

const DEFAULT_PROGRESS: Progress = {
  prayer: "spirit",
  mysterySet: "joyful",
  spiritStep: 0,
  maryStep: 0,
  at: 0,
};

export default function Page() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [screen, setScreen] = useState<"home" | "player">("home");
  const [tab, setTab] = useState(0);
  /* Taps on the tab already open, counted. Home sends that page back to the
     top on each one — see the note there. A count rather than a flag so two
     in a row read as two requests rather than one. */
  const [home, setHome] = useState(0);
  const [prayer, setPrayer] = useState<PrayerId>("spirit");
  const [mysterySet, setMysterySet] = useState<MysteryKey>("joyful");
  const [step, setStep] = useState(0);
  const [spiritStep, setSpiritStep] = useState(0);
  const [maryStep, setMaryStep] = useState(0);
  const [sheet, setSheet] = useState(false);
  // Which devotional book is open, or null for none. The reader stays mounted
  // through the close so it can slide away rather than vanish.
  const [devotionTrack, setDevotionTrack] = useState<DevotionTrack | null>(null);
  const [coupleSheet, setCoupleSheet] = useState(false);
  // The church picker, and the feast the calendar has open. The feast is held
  // as a pair rather than a date because a day can keep more than one, and it
  // stays set through the closing transition so the sheet can slide away with
  // its text still in it.
  const [riteSheet, setRiteSheet] = useState(false);
  const [feast, setFeast] = useState<{ feast: Feast; day: Day } | null>(null);
  const [feastOpen, setFeastOpen] = useState(false);
  const [fading, setFading] = useState(false);
  // The closing moment: shown after the last step is tapped past, and the only
  // way a prayer is counted as finished rather than merely left.
  const [done, setDone] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  /* An invitation code from a `?friend=` link, and how redeeming it went.
     Held by the shell rather than the Friends page because it arrives in the
     URL before that page is built, and because a signed-out visitor has to go
     through /login and come back — see the restore effect below. */
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{
    error: FriendsError | null;
  } | null>(null);

  /* ---------------- content, account, sync ---------------- */

  // Bumps when Supabase hands us newer prayer text; every string below is read
  // through content.ts, so re-rendering on it is what makes the swap visible.
  const contentVersion = useRemoteContent();
  // A confirmation or recovery token that was aimed at "/" instead of
  // /auth/confirm. Redeeming it is that page's job, so this only forwards.
  const strayToken = useStrayAuthToken();
  const auth = useAuth();
  // Undefined until the check has run, so the tab bar does not flash a fifth
  // tab in and out on every launch. Only true unlocks it.
  const isAdmin = useAdmin(auth.user?.id ?? null) === true;
  const push = usePush(prefs.lang);
  const dailyVerse = useDailyVerse(push.endpoint);
  // Opened from the morning notification: straight to the Today tab, where
  // the whole verse is waiting at the top.
  useEffect(() => {
    if (dailyVerse.arrived) setTab(1);
  }, [dailyVerse.arrived]);
  // Whether the couples devotion is unlocked. The read policy in 0009 enforces
  // this independently; here it only decides how the card is drawn.
  //
  // Declared before the devotions because it is an input to them: the couples
  // page is withheld from an account that is not half of a couple, so pairing
  // changes what that query returns and has to re-ask it.
  const couple = useCouple(auth.user?.id ?? null);
  const friends = useFriends(auth.user?.id ?? null);
  // Held here rather than inside the Friends page because Settings draws the
  // switch and the Friends page explains it — one copy, two screens.
  const { profile, setShareActivity } = useProfile(auth.user?.id ?? null);
  const devotions = useDevotions(prefs.lang, couple.coupleId);
  // Which church's year the Calendar tab keeps. Held on the device, outside
  // the synced prefs — see the note in useLiturgy.
  const liturgy = useLiturgy();
  /* Today's readings, for the church the reader keeps. Held here rather than
     inside Home because the home screen and the Today tab both draw them and
     must not each start their own fetch of the same day. */
  const todayKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const readings = useReadings(todayKey, liturgy.rite, prefs.lang);
  const readingProgress = useReadingProgress(
    todayKey,
    liturgy.rite,
    useMemo(() => (readings.data?.readings ?? []).map((r) => r.kind), [readings.data]),
  );
  // Tri-state on purpose: "loading" is not "signed out". Passing false while
  // the session is still being read would flash a signed-out-only message at
  // somebody who is signed in.
  const { banner, modal, dismiss } = useAnnouncements(
    auth.status === "loading" ? null : auth.status === "signed-in",
  );
  // Counted from the device's own log of finished prayers, so the home screen
  // shows real numbers whether or not anyone is signed in.
  const { stats, record } = useStats(auth.user?.id ?? null, hydrated);

  // The snapshot the sync layer mirrors. Held as state rather than derived so
  // there is exactly one `at` per change, shared by localStorage and Supabase.
  const [snapshot, setSnapshot] = useState<Progress>(DEFAULT_PROGRESS);
  // Set when a snapshot arrives from another device: that copy's timestamp is
  // when it was prayed, and adopting it must not reset the 24h resume window.
  const keepAt = useRef<number | null>(null);

  const adoptPrefs = useCallback((p: Prefs) => setPrefs(p), []);

  const adoptProgress = useCallback((p: Progress) => {
    keepAt.current = p.at;
    setPrayer(p.prayer);
    setMysterySet(p.mysterySet);
    setSpiritStep(p.spiritStep);
    setMaryStep(p.maryStep);
    setStep(p.prayer === "mary" ? p.maryStep : p.spiritStep);
  }, []);

  const syncStatus = useCloudSync({
    userId: auth.user?.id ?? null,
    prefs,
    progress: snapshot,
    ready: hydrated,
    onAdoptPrefs: adoptPrefs,
    onAdoptProgress: adoptProgress,
  });

  const steps = useMemo(
    () => buildSteps(prayer, prefs.lang, mysterySet),
    // contentVersion is not read in the body: it is here because buildSteps
    // reads the content store, which the version is the signal for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prayer, prefs.lang, mysterySet, contentVersion],
  );
  const total = steps.length;
  const progress = total > 1 ? step / (total - 1) : 0;

  // Held while a prayer is open and while the closing moment reads. The
  // service worker layer reads it to keep a new build from reloading the page
  // out from under somebody mid-decade; it applies the moment this clears.
  useEffect(() => {
    setAppBusy(screen === "player" || done || devotionTrack !== null);
    return () => setAppBusy(false);
  }, [screen, done, devotionTrack]);

  useWakeLock(prefs.awake && screen === "player");
  useAmbience(prefs.audio && screen === "player");

  // Browsers only start audio a person asked for, and Safari only accepts the
  // request while the gesture is still being handled -- too early for the
  // effect that opens the ambience. So the first touch anywhere unlocks the
  // shared context, before anything asks it for a sound.
  useEffect(watchAudioUnlock, []);

  // Fetch and decode the short sounds up front. A page turn that has to wait
  // for a download is not a page turn.
  useEffect(() => preloadSfx(), []);

  /* ---------------- restore ---------------- */
  useEffect(() => {
    const storedPrefs = readPrefs();
    if (storedPrefs) setPrefs(storedPrefs);

    const p = readProgress();
    if (p) {
      // A stale snapshot still seeds the sync layer — it is this device's last
      // known state, and the other device's copy has to be compared against
      // something — but it does not resume the player.
      keepAt.current = p.at;
      setSnapshot(p);
      if (isFresh(p)) {
        setPrayer(p.prayer);
        setMysterySet(p.mysterySet);
        setSpiritStep(p.spiritStep);
        setMaryStep(p.maryStep);
        setStep(p.prayer === "mary" ? p.maryStep : p.spiritStep);
      }
    }

    // Deep links from the manifest shortcuts.
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("set");
    if (wanted === "mary" || wanted === "holy-spirit") {
      setPrayer(wanted === "mary" ? "mary" : "spirit");
      setStep(0);
      setScreen("player");
      window.history.replaceState(null, "", window.location.pathname);
    }

    /* An invitation someone sent over WhatsApp, and the notifications that
       point at this page. Both land on Friends. */
    const invite = (params.get("friend") ?? "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase();
    /* Kept for the length of the tab, not the device: a signed-out visitor is
       sent to /login and comes back to "/" with the code gone from the URL,
       and without this the invitation is lost exactly for the people who most
       need it to survive — the ones who did not have an account yet. It is
       deliberately not localStorage: an invitation that outlived the visit and
       reappeared next week would be a mystery rather than a link. */
    const stored = (() => {
      try {
        return window.sessionStorage.getItem(INVITE_KEY);
      } catch {
        return null;
      }
    })();

    if (invite.length === 10) {
      setPendingInvite(invite);
      try {
        window.sessionStorage.setItem(INVITE_KEY, invite);
      } catch {
        /* Private mode. The code is in state and works for this visit. */
      }
      setTab(3);
      window.history.replaceState(null, "", window.location.pathname);
    } else if (stored) {
      setPendingInvite(stored);
      setTab(3);
    } else if (params.get("tab") === "friends") {
      // Where a friends notification points.
      setTab(3);
      window.history.replaceState(null, "", window.location.pathname);
    }

    setHydrated(true);
  }, []);

  /* Redeeming is the shell's because the outcome is the shell's to remember:
     the card that reports it has to survive the Friends page re-rendering
     under it, and the stored code must be cleared exactly once. */
  const acceptInvite = useCallback(async () => {
    if (!pendingInvite) return;
    const error = await friends.redeem(pendingInvite);
    setInviteResult({ error });
    if (!error) setPendingInvite(null);
    try {
      window.sessionStorage.removeItem(INVITE_KEY);
    } catch {
      /* Nothing was stored. */
    }
  }, [pendingInvite, friends]);

  const dismissInvite = useCallback(() => {
    setPendingInvite(null);
    setInviteResult(null);
    try {
      window.sessionStorage.removeItem(INVITE_KEY);
    } catch {
      /* Nothing was stored. */
    }
  }, []);

  // Admin is the last tab, now index 5. Losing it while standing on it sends
  // the reader home rather than to a blank page.
  useEffect(() => {
    if (!isAdmin && tab > 4) setTab(0);
  }, [isAdmin, tab]);

  /* The pages, swiped between. Held here rather than inside Home because the
     tab bar needs the same gesture: it draws its chip wherever the pages have
     got to, which is not a whole tab until the finger lets go.

     Off whenever something is over the app. A sheet's own scrim takes the
     touches, but the player leaves the pages beneath it live, and a devotional
     book's reader has a horizontal drag of its own. */
  const swipe = useTabSwipe(
    tab,
    isAdmin ? 6 : 5,
    setTab,
    screen === "home" && devotionTrack === null,
  );

  useEffect(() => {
    const { theme } = paletteInfo(prefs.palette);
    document.documentElement.dataset.palette = prefs.palette;
    // Keep the browser chrome and task-switcher card in step with the palette.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme);
  }, [prefs.palette]);

  /* ---------------- persist ---------------- */
  useEffect(() => {
    if (!hydrated) return;
    writeLocal(PREFS_KEY, prefs);
  }, [hydrated, prefs]);

  useEffect(() => {
    if (!hydrated) return;
    const next: Progress = {
      prayer,
      mysterySet,
      spiritStep: prayer === "spirit" ? step : spiritStep,
      maryStep: prayer === "mary" ? step : maryStep,
      at: keepAt.current ?? Date.now(),
    };
    keepAt.current = null;
    writeLocal(PROGRESS_KEY, next);
    setSnapshot(next);
  }, [hydrated, prayer, mysterySet, step, spiritStep, maryStep]);

  /* ---------------- navigation ---------------- */
  // Two frames of opacity 0 give the crossfade something to animate from.
  const fadeTimer = useRef<number | undefined>(undefined);
  const crossfade = useCallback((next: number) => {
    setStep(next);
    setFading(true);
    window.clearTimeout(fadeTimer.current);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setFading(false)),
    );
  }, []);

  /* ---------------- finishing ---------------- */
  const doneTimer = useRef<number | undefined>(undefined);
  // When this sitting started. Minutes are counted per sitting, not from the
  // first bead of a prayer that was put down yesterday and picked up today.
  const openedAt = useRef(0);

  useEffect(() => {
    if (screen === "player") openedAt.current = Date.now();
  }, [screen]);

  // Tapping past the last step ends the prayer rather than doing nothing.
  const complete = useCallback(() => {
    if (done) return;
    setDone(true);
    // The only place a prayer is counted. Leaving the player part-way through
    // saves the place but records nothing, which is what makes the streak mean
    // "prayed" rather than "opened the app".
    record(
      prayer,
      prayer === "mary" ? mysterySet : null,
      openedAt.current ? (Date.now() - openedAt.current) / 1000 : 0,
    );
    if (prefs.audio) playChime();
  }, [done, prefs.audio, record, prayer, mysterySet]);

  // A finished prayer starts again from the beginning, so the home screen
  // offers a fresh one instead of resuming a closing prayer.
  const finish = useCallback(() => {
    window.clearTimeout(doneTimer.current);
    if (prayer === "mary") setMaryStep(0);
    else setSpiritStep(0);
    setStep(0);
    setScreen("home");
    // Held until the player has slid away, so the overlay does not blink off
    // and reveal the first step on the way out.
    window.setTimeout(() => setDone(false), 560);
  }, [prayer]);

  // The overlay reads for a moment on its own, then hands back to home. A tap
  // during it goes to Completion, which calls finish early.
  useEffect(() => {
    if (!done) return;
    doneTimer.current = window.setTimeout(finish, 3400);
    return () => window.clearTimeout(doneTimer.current);
  }, [done, finish]);

  const advance = useCallback(() => {
    if (step >= total - 1) return complete();
    if (prefs.audio) playPageTurn();
    crossfade(step + 1);
  }, [step, total, crossfade, complete]);

  const back = useCallback(() => {
    if (step === 0 || done) return;
    // Softer going back.
    if (prefs.audio) playPageTurn(true);
    crossfade(step - 1);
  }, [step, done, crossfade]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screen !== "player") return;
      if (e.key === " ") {
        e.preventDefault();
        if (done) finish();
        else advance();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        if (done) return finish();
        // The same mapping the tap halves use, in either language: right is
        // forward, left is back.
        if (e.key === "ArrowRight") advance();
        else back();
        return;
      }
      if (e.key === "Escape") {
        if (done) finish();
        else closePlayer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, advance, back, done, finish]);

  /* ---------------- transitions between screens ---------------- */
  const openSpirit = () => {
    setPrayer("spirit");
    setStep(spiritStep);
    setScreen("player");
  };
  const startMary = () => {
    setPrayer("mary");
    setStep(0);
    setSheet(false);
    setScreen("player");
  };
  const startToday = () => {
    setPrayer("mary");
    setMysterySet(setForDay(new Date().getDay()));
    setStep(0);
    setScreen("player");
  };
  const openDevotion = (track: DevotionTrack) => {
    setDevotionTrack(track);
  };
  const closeDevotion = () => {
    setDevotionTrack(null);
  };
  const closePlayer = () => {
    if (done) return finish();
    if (prayer === "mary") setMaryStep(step);
    else setSpiritStep(step);
    setScreen("home");
  };

  // Every change is stamped, so the newer of two devices can be identified.
  const patch = (p: Partial<Prefs>) =>
    setPrefs((v) => ({ ...v, ...p, updatedAt: Date.now() }));

  const t = ui(prefs.lang);
  const devotionDate = new Intl.DateTimeFormat(intlLocale(prefs.lang), {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const activeName = prayer === "mary" ? t.maryName : t.spiritName;
  const isPlayer = screen === "player";

  // Mid-redirect to /auth/confirm. Painting the app here would show somebody
  // who is about to be signed in a home screen that says they are not.
  if (strayToken) return null;

  return (
    <main className="app-shell" dir={prefs.lang === "ar" ? "rtl" : "ltr"}>
      <Home
        hidden={isPlayer}
        tab={tab}
        swipe={swipe}
        home={home}
        lang={prefs.lang}
        stats={stats}
        progress={progress}
        activeName={activeName}
        prayer={prayer}
        mysterySet={mysterySet}
        beadStyle={prefs.beadStyle}
        palette={prefs.palette}
        size={prefs.size}
        toggles={[prefs.audio, prefs.awake]}
        auth={auth}
        syncStatus={syncStatus}
        isAdmin={isAdmin}
        push={push}
        devotions={devotions}
        liturgy={liturgy}
        readings={readings}
        readingProgress={readingProgress}
        dailyVerse={dailyVerse}
        paired={couple.paired}
        friends={friends}
        pendingInvite={pendingInvite}
        inviteResult={inviteResult}
        onAcceptInvite={acceptInvite}
        onDismissInvite={dismissInvite}
        onSignIn={() => {
          window.location.href = "/login";
        }}
        shareActivity={profile?.shareActivity ?? true}
        onToggleShareActivity={() =>
          void setShareActivity(!(profile?.shareActivity ?? true))
        }
        banner={banner}
        onDismissBanner={() => banner && dismiss(banner.id)}
        onToggleLang={() =>
          patch({ lang: prefs.lang === "ar" ? "en" : "ar" })
        }
        onSetLang={(lang) => patch({ lang })}
        onResume={() => {
          setScreen("player");
        }}
        onOpenSpirit={openSpirit}
        onOpenSheet={() => {
          setSheet(true);
        }}
        onStartToday={startToday}
        onOpenDevotion={openDevotion}
        onOpenRites={() => {
          setRiteSheet(true);
        }}
        onOpenFeast={(f, d) => {
          setFeast({ feast: f, day: d });
          setFeastOpen(true);
        }}
        onOpenCouple={() => {
          setCoupleSheet(true);
        }}
        onSetStyle={(beadStyle) => {
          patch({ beadStyle });
        }}
        onSetPalette={(palette) => {
          patch({ palette });
        }}
        onSetSize={(size) => patch({ size })}
        onToggle={(i) => {
          // In the order Home draws them — see SETTINGS_TOGGLES there.
          patch([{ audio: !prefs.audio }, { awake: !prefs.awake }][i]);
        }}
      />

      <TabBar
        tab={tab}
        at={swipe.at}
        dragging={swipe.dragging}
        hidden={isPlayer}
        isAdmin={isAdmin}
        badge={friends.incoming.length}
        onSelect={(i) => {
          if (i === tab) setHome((n) => n + 1);
          setTab(i);
        }}
      />

      <Player
        open={isPlayer}
        steps={steps}
        step={step}
        prayer={prayer}
        mysterySet={mysterySet}
        lang={prefs.lang}
        beadStyle={prefs.beadStyle}
        size={prefs.size}
        dim={prefs.dim}
        fading={fading}
        done={done}
        onAdvance={advance}
        onBack={back}
        onClose={closePlayer}
        audio={prefs.audio}
        onToggleDim={() => patch({ dim: !prefs.dim })}
        onToggleAudio={() => {
          patch({ audio: !prefs.audio });
        }}
        onFinish={finish}
      />

      <DevotionReader
        open={devotionTrack !== null}
        devotion={devotionTrack ? devotions.byTrack[devotionTrack] : null}
        lang={prefs.lang}
        dateLine={devotionDate}
        trackLabel={
          t.devotion.tracks[TRACKS.indexOf(devotionTrack ?? "individual")]
        }
        startAt={
          // Resume where the page was left, unless it was finished — a page
          // read this morning opens sealed again, so re-reading it is a read
          // rather than a jump to the closing tick.
          devotionTrack && devotions.isUnfinished(devotionTrack)
            ? (devotions.stateOf(devotionTrack)?.shown ?? 1)
            : 1
        }
        audio={prefs.audio}
        onProgress={(shown, total) =>
          devotionTrack && devotions.saveProgress(devotionTrack, shown, total)
        }
        onComplete={() => devotionTrack && devotions.markRead(devotionTrack)}
        onClose={closeDevotion}
      />

      <CoupleSheet
        open={coupleSheet}
        lang={prefs.lang}
        couple={couple}
        onSignIn={() => {
          window.location.href = "/login";
        }}
        onClose={() => setCoupleSheet(false)}
      />

      <FeastSheet
        open={feastOpen}
        feast={feast?.feast ?? null}
        day={feast?.day ?? null}
        lang={prefs.lang}
        onClose={() => setFeastOpen(false)}
      />

      <RiteSheet
        open={riteSheet}
        lang={prefs.lang}
        liturgy={liturgy}
        onClose={() => setRiteSheet(false)}
      />

      <MysterySheet
        open={sheet}
        lang={prefs.lang}
        selected={mysterySet}
        onPick={(k) => {
          setMysterySet(k);
        }}
        onStart={startMary}
        onClose={() => setSheet(false)}
      />

      {/* Held back until the app is on the home screen: a message over a prayer
          in progress, or over the closing moment, would be an interruption
          rather than an announcement. */}
      {modal &&
        !isPlayer &&
        !done &&
        devotionTrack === null &&
        !coupleSheet &&
        !riteSheet &&
        !feastOpen && (
        <AnnouncementModal
          row={modal}
          lang={prefs.lang}
          onDismiss={() => dismiss(modal.id)}
        />
      )}

      {/* Asked on every launch while notifications are off. Suppressed while a
          prayer is open, while the closing moment reads, and whenever an
          announcement is already covering the app -- two sheets arriving
          together is a pile-up, and the announcement was scheduled by a person
          for a reason. */}
      <NotificationsPrompt
        push={push}
        suppressed={
          isPlayer ||
          done ||
          sheet ||
          coupleSheet ||
          riteSheet ||
          feastOpen ||
          Boolean(modal) ||
          devotionTrack !== null
        }
      />

      {/* Over everything until the app has its reader's preferences: this
          device's at once, and an account's once the first pull has answered
          either way. Lifted on its own after a few seconds regardless. */}
      <LaunchSplash
        ready={
          hydrated &&
          auth.status !== "loading" &&
          (auth.status !== "signed-in" || syncStatus === "synced" || syncStatus === "offline")
        }
      />
    </main>
  );
}
