"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Home from "@/components/Home";
import MysterySheet from "@/components/MysterySheet";
import Player from "@/components/Player";
import TabBar from "@/components/TabBar";
import {
  type BeadStyle,
  type Lang,
  type MysteryKey,
  type PrayerId,
  setForDay,
  ui,
} from "@/lib/content";
import { buildSteps } from "@/lib/steps";
import { useAmbientDrone } from "@/lib/useAmbientDrone";
import { useWakeLock } from "@/lib/useWakeLock";

const PREFS_KEY = "up_prefs_v1";
const PROGRESS_KEY = "up_progress_v1";
/** After a day away it is a new prayer, not a resumed one. */
const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;

type Prefs = {
  lang: Lang;
  beadStyle: BeadStyle;
  size: number;
  dim: boolean;
  haptics: boolean;
  audio: boolean;
  awake: boolean;
};

type Progress = {
  prayer: PrayerId;
  mysterySet: MysteryKey;
  spiritStep: number;
  maryStep: number;
  at: number;
};

const DEFAULT_PREFS: Prefs = {
  lang: "ar",
  beadStyle: "arc",
  size: 1,
  dim: false,
  haptics: true,
  audio: false,
  awake: true,
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
  const [hydrated, setHydrated] = useState(false);

  const steps = useMemo(
    () => buildSteps(prayer, prefs.lang, mysterySet),
    [prayer, prefs.lang, mysterySet],
  );
  const total = steps.length;
  const progress = total > 1 ? step / (total - 1) : 0;

  useWakeLock(prefs.awake && screen === "player");
  useAmbientDrone(prefs.audio && screen === "player");

  /* ---------------- restore ---------------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) setPrefs((p) => ({ ...p, ...(JSON.parse(raw) as Partial<Prefs>) }));
    } catch {
      /* private mode — defaults are fine */
    }
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      const p = raw ? (JSON.parse(raw) as Progress) : null;
      if (p && Date.now() - p.at < RESUME_WINDOW_MS) {
        setPrayer(p.prayer);
        setMysterySet(p.mysterySet);
        setSpiritStep(p.spiritStep);
        setMaryStep(p.maryStep);
        setStep(p.prayer === "mary" ? p.maryStep : p.spiritStep);
      }
    } catch {
      /* a corrupt snapshot must never stop the app opening */
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

  /* ---------------- persist ---------------- */
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* private mode */
    }
  }, [hydrated, prefs]);

  useEffect(() => {
    if (!hydrated) return;
    const snapshot: Progress = {
      prayer,
      mysterySet,
      spiritStep: prayer === "spirit" ? step : spiritStep,
      maryStep: prayer === "mary" ? step : maryStep,
      at: Date.now(),
    };
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(snapshot));
    } catch {
      /* private mode */
    }
  }, [hydrated, prayer, mysterySet, step, spiritStep, maryStep]);

  /* ---------------- navigation ---------------- */
  const haptic = useCallback(
    (ms = 8) => {
      if (!prefs.haptics || !navigator.vibrate) return;
      try {
        navigator.vibrate(ms);
      } catch {
        /* blocked by the browser */
      }
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

  const advance = useCallback(() => {
    if (step >= total - 1) return haptic(24);
    haptic(8);
    crossfade(step + 1);
  }, [step, total, haptic, crossfade]);

  const back = useCallback(() => {
    if (step === 0) return;
    haptic(6);
    crossfade(step - 1);
  }, [step, haptic, crossfade]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screen !== "player") return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === " ") {
        e.preventDefault();
        advance();
      }
      if (e.key === "Escape") closePlayer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, advance]);

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
    if (prayer === "mary") setMaryStep(step);
    else setSpiritStep(step);
    setScreen("home");
  };

  const patch = (p: Partial<Prefs>) => setPrefs((v) => ({ ...v, ...p }));

  const t = ui(prefs.lang);
  const activeName = prayer === "mary" ? t.maryName : t.spiritName;
  const isPlayer = screen === "player";

  return (
    <main className="app-shell" dir={prefs.lang === "ar" ? "rtl" : "ltr"}>
      <Home
        hidden={isPlayer}
        tab={tab}
        lang={prefs.lang}
        streak={4}
        progress={progress}
        activeName={activeName}
        mysterySet={mysterySet}
        beadStyle={prefs.beadStyle}
        size={prefs.size}
        toggles={[prefs.dim, prefs.haptics, prefs.audio, prefs.awake]}
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
        lang={prefs.lang}
        hidden={isPlayer}
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
        audio={prefs.audio}
        fading={fading}
        onAdvance={advance}
        onBack={back}
        onClose={closePlayer}
        onToggleDim={() => patch({ dim: !prefs.dim })}
        onToggleAudio={() => patch({ audio: !prefs.audio })}
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
    </main>
  );
}
