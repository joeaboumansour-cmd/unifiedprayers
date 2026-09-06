"use client";

import { useEffect, useSyncExternalStore } from "react";

import { applyContent, contentVersion, subscribeContent } from "@/lib/content";
import { getSupabase } from "@/lib/supabase/client";

/** Documents fetched previously, so a correction survives going offline. */
const CACHE_KEY = "up_content_v1";

type Cached = {
  design?: { doc: unknown; updated_at: string };
  prayers?: { doc: unknown; updated_at: string };
};

/**
 * The content shapes this build knows how to read. A row published for a newer
 * app is skipped rather than adopted — an old client showing a document it
 * only half understands is worse than one showing the text it shipped with.
 */
const SUPPORTED_VERSION = 1;

function readCache(): Cached {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cached) : {};
  } catch {
    return {};
  }
}

function writeCache(next: Cached): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    /* private mode or quota — the fetch just happens again next launch */
  }
}

/**
 * Overlays the prayer text from Supabase onto the bundled JSON, and returns the
 * content version so the caller re-renders when it changes.
 *
 * The order matters: the cached copy is applied synchronously on mount, before
 * any network call, so a device that has fetched once before opens on the
 * corrected text even with no connection. The fetch that follows is a refresh,
 * not a load — if it fails, nothing happens and nothing is reported. The app
 * has never needed the network to show a prayer and still does not.
 */
export function useRemoteContent(): number {
  const version = useSyncExternalStore(
    subscribeContent,
    contentVersion,
    // The server render always has the bundled content, version 0. Returning
    // anything else here would make hydration disagree with the HTML.
    () => 0,
  );

  useEffect(() => {
    const cache = readCache();
    if (cache.design || cache.prayers) {
      applyContent({ design: cache.design?.doc, prayers: cache.prayers?.doc });
    }

    const supabase = getSupabase();
    if (!supabase) return;

    let live = true;
    (async () => {
      const { data, error } = await supabase
        .from("content_documents")
        .select("key, doc, version, updated_at")
        .in("key", ["design", "prayers"]);
      if (!live || error || !data) return;

      const next: Cached = { ...cache };
      const fresh: { design?: unknown; prayers?: unknown } = {};

      for (const row of data) {
        if (row.version > SUPPORTED_VERSION) continue;
        if (row.key !== "design" && row.key !== "prayers") continue;
        // Re-applying an unchanged document would bump the version and force a
        // pointless re-render of the whole app, possibly mid-prayer.
        if (next[row.key]?.updated_at === row.updated_at) continue;
        next[row.key] = { doc: row.doc, updated_at: row.updated_at };
        fresh[row.key] = row.doc;
      }

      if (fresh.design === undefined && fresh.prayers === undefined) return;

      const adopted = applyContent(fresh);
      // Only cache what actually passed the shape check, so a malformed row is
      // re-fetched next launch rather than being remembered as good.
      if (!adopted.design) next.design = cache.design;
      if (!adopted.prayers) next.prayers = cache.prayers;
      writeCache(next);
    })().catch(() => {
      /* offline, or the table does not exist yet — the bundle covers us */
    });

    return () => {
      live = false;
    };
  }, []);

  return version;
}
