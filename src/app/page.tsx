"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnnouncementModal } from "@/components/Announcements";
import Home from "@/components/Home";
import MysterySheet from "@/components/MysterySheet";
import NotificationsPrompt from "@/components/NotificationsPrompt";
import Player from "@/components/Player";
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
import { setAppBusy } from "@/lib/appBusy";
import { watchAudioUnlock } from "@/lib/audio";
import { playChime } from "@/lib/chime";
import { haptic as fireHaptic, watchHapticTouch } from "@/lib/haptics";
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
import { useVerse } from "@/lib/useVerse";
import { useWakeLock } from "@/lib/useWakeLock";

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
  const [prayer, setPrayer] = useState<PrayerId>("spirit");
  const [mysterySet, setMysterySet] = useState<MysteryKey>("joyful");
  const [step, setStep] = useState(0);
  const [spiritStep, setSpiritStep] = useState(0);
  const [maryStep, setMaryStep] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [fading, setFading] = useState(false);
  // The closing moment: shown after the last step is tapped past, and the only
  // way a prayer is counted as finished rather than merely left.
  const [done, setDone] = useState(false);
  const [hydrated, setHydrated] = useState(false);

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
  const verse = useVerse(prefs.lang);
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
    setAppBusy(screen === "player" || done);
    return () => setAppBusy(false);
  }, [screen, done]);

  useWakeLock(prefs.awake && screen === "player");
  useAmbience(prefs.audio && screen === "player");

  // Browsers only start audio a person asked for, and Safari only accepts the
  // request while the gesture is still being handled -- too early for the
  // effect that opens the ambience. So the first touch anywhere unlocks the
  // shared context, before anything asks it for a sound.
  useEffect(watchAudioUnlock, []);

  // Every touch gets a small haptic, whether or not the thing under it has one
  // of its own.
  useEffect(() => watchHapticTouch(prefs.haptics), [prefs.haptics]);

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
    const wanted = new URLSearchParams(window.location.search).get("set");
    if (wanted === "mary" || wanted === "holy-spirit") {
      setPrayer(wanted === "mary" ? "mary" : "spirit");
      setStep(0);
      setScreen("player");
      window.history.replaceState(null, "", window.location.pathname);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!isAdmin && tab > 3) setTab(0);
  }, [isAdmin, tab]);

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
  const haptic = useCallback(
    (ms: number | number[] = 8) => {
      if (!prefs.haptics) return;
      fireHaptic(ms);
    },
    [prefs.haptics],
  );

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
    haptic([14, 70, 20, 60, 30]);
    if (prefs.audio) playChime();
  }, [done, haptic, prefs.audio, record, prayer, mysterySet]);

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
    haptic(8);
    crossfade(step + 1);
  }, [step, total, haptic, crossfade, complete]);

  const back = useCallback(() => {
    if (step === 0 || done) return;
    haptic(6);
    crossfade(step - 1);
  }, [step, done, haptic, crossfade]);

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
    haptic(10);
    setPrayer("spirit");
    setStep(spiritStep);
    setScreen("player");
  };
  const startMary = () => {
    haptic(12);
    setPrayer("mary");
    setStep(0);
    setSheet(false);
    setScreen("player");
  };
  const startToday = () => {
    haptic(12);
    setPrayer("mary");
    setMysterySet(setForDay(new Date().getDay()));
    setStep(0);
    setScreen("player");
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
        lang={prefs.lang}
        stats={stats}
        progress={progress}
        activeName={activeName}
        mysterySet={mysterySet}
        beadStyle={prefs.beadStyle}
        palette={prefs.palette}
        size={prefs.size}
        toggles={[prefs.dim, prefs.haptics, prefs.audio, prefs.awake]}
        auth={auth}
        syncStatus={syncStatus}
        isAdmin={isAdmin}
        push={push}
        verse={verse}
        banner={banner}
        onDismissBanner={() => banner && dismiss(banner.id)}
        onToggleLang={() =>
          patch({ lang: prefs.lang === "ar" ? "en" : "ar" })
        }
        onSetLang={(lang) => patch({ lang })}
        onResume={() => {
          haptic(10);
          setScreen("player");
        }}
        onOpenSpirit={openSpirit}
        onOpenSheet={() => {
          haptic(10);
          setSheet(true);
        }}
        onStartToday={startToday}
        onSetStyle={(beadStyle) => {
          haptic(6);
          patch({ beadStyle });
        }}
        onSetPalette={(palette) => {
          haptic(8);
          patch({ palette });
        }}
        onSetSize={(size) => patch({ size })}
        onToggle={(i) => {
          haptic(6);
          patch(
            [
              { dim: !prefs.dim },
              { haptics: !prefs.haptics },
              { audio: !prefs.audio },
              { awake: !prefs.awake },
            ][i],
          );
        }}
      />

      <TabBar
        tab={tab}
        hidden={isPlayer}
        isAdmin={isAdmin}
        onSelect={(i) => {
          haptic(5);
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
        onToggleDim={() => patch({ dim: !prefs.dim })}
        onFinish={finish}
      />

      <MysterySheet
        open={sheet}
        lang={prefs.lang}
        selected={mysterySet}
        onPick={(k) => {
          haptic(6);
          setMysterySet(k);
        }}
        onStart={startMary}
        onClose={() => setSheet(false)}
      />

      {/* Held back until the app is on the home screen: a message over a prayer
          in progress, or over the closing moment, would be an interruption
          rather than an announcement. */}
      {modal && !isPlayer && !done && (
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
        suppressed={isPlayer || done || sheet || Boolean(modal)}
      />
    </main>
  );
}
