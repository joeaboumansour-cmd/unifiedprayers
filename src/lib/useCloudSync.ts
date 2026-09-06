"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getSupabase } from "@/lib/supabase/client";
import type { PrefsRow, ProgressRow } from "@/lib/supabase/types";
import {
  type Prefs,
  type Progress,
  prefsToRow,
  progressToRow,
  rowToPrefs,
  rowToProgress,
} from "@/lib/state";

/** How long to sit on a change before writing it. */
const PREFS_DEBOUNCE_MS = 800;
/** Longer: progress ticks once per bead, and a decade is fifty of them. */
const PROGRESS_DEBOUNCE_MS = 4000;

export type SyncStatus = "idle" | "syncing" | "synced" | "offline";

type Options = {
  userId: string | null;
  prefs: Prefs;
  progress: Progress;
  /** False until localStorage has been read; pushing before then is a wipe. */
  ready: boolean;
  onAdoptPrefs: (p: Prefs) => void;
  onAdoptProgress: (p: Progress) => void;
};

/**
 * Mirrors prefs and progress to Supabase for the signed-in account.
 *
 * Reconciliation is last-write-wins per document, not per field: on sign-in the
 * newer of the two copies wins outright. Merging field by field would need a
 * timestamp per field, and would produce settings no one chose -- one device's
 * palette beside another's language. Whole-copy means the answer is always
 * "whichever device you touched last", which is the one a person can predict.
 *
 * Every failure here is silent by design. This is an offline-first PWA: losing
 * the network must look like nothing happening, never like an error.
 */
export function useCloudSync({
  userId,
  prefs,
  progress,
  ready,
  onAdoptPrefs,
  onAdoptProgress,
}: Options): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>("idle");

  // Guards the initial pull: until it has run, a push would overwrite the
  // remote copy with whatever this device happens to be holding.
  const reconciled = useRef(false);
  // Latest values, read by the debounced timers without re-arming them.
  const latest = useRef({ prefs, progress });
  latest.current = { prefs, progress };

  const adoptPrefs = useRef(onAdoptPrefs);
  adoptPrefs.current = onAdoptPrefs;
  const adoptProgress = useRef(onAdoptProgress);
  adoptProgress.current = onAdoptProgress;

  /* ------------------------------- pull ------------------------------- */

  useEffect(() => {
    reconciled.current = false;
    const supabase = getSupabase();
    if (!supabase || !userId || !ready) {
      setStatus("idle");
      return;
    }

    let live = true;
    setStatus("syncing");

    (async () => {
      const [prefsRes, progressRes] = await Promise.all([
        supabase.from("user_prefs").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("user_progress").select("*").eq("user_id", userId).maybeSingle(),
      ]);
      if (!live) return;

      if (prefsRes.error || progressRes.error) {
        setStatus("offline");
        // Leave reconciled false: without knowing the remote state we must not
        // push over it. The next sign-in or reload tries again.
        return;
      }

      const local = latest.current;

      const remotePrefs = prefsRes.data ? rowToPrefs(prefsRes.data) : null;
      if (remotePrefs && remotePrefs.updatedAt > local.prefs.updatedAt) {
        adoptPrefs.current(remotePrefs);
      } else {
        await supabase
          .from("user_prefs")
          .upsert(prefsToRow(local.prefs, userId), { onConflict: "user_id" });
      }

      const remoteProgress = progressRes.data ? rowToProgress(progressRes.data) : null;
      if (remoteProgress && remoteProgress.at > local.progress.at) {
        adoptProgress.current(remoteProgress);
      } else {
        await supabase
          .from("user_progress")
          .upsert(progressToRow(local.progress, userId), { onConflict: "user_id" });
      }

      if (!live) return;
      reconciled.current = true;
      setStatus("synced");
    })().catch(() => live && setStatus("offline"));

    return () => {
      live = false;
    };
  }, [userId, ready]);

  /* ------------------------------- push ------------------------------- */

  const pushPrefs = useCallback(async (row: PrefsRow) => {
    const supabase = getSupabase();
    if (!supabase) return;
    setStatus("syncing");
    const { error } = await supabase
      .from("user_prefs")
      .upsert(row, { onConflict: "user_id" });
    setStatus(error ? "offline" : "synced");
  }, []);

  const pushProgress = useCallback(async (row: ProgressRow) => {
    const supabase = getSupabase();
    if (!supabase) return;
    setStatus("syncing");
    const { error } = await supabase
      .from("user_progress")
      .upsert(row, { onConflict: "user_id" });
    setStatus(error ? "offline" : "synced");
  }, []);

  useEffect(() => {
    if (!userId || !ready || !reconciled.current) return;
    const id = window.setTimeout(
      () => void pushPrefs(prefsToRow(prefs, userId)),
      PREFS_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(id);
  }, [userId, ready, prefs, pushPrefs]);

  useEffect(() => {
    if (!userId || !ready || !reconciled.current) return;
    const id = window.setTimeout(
      () => void pushProgress(progressToRow(progress, userId)),
      PROGRESS_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(id);
  }, [userId, ready, progress, pushProgress]);

  return status;
}
