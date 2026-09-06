"use client";

import { useCallback, useEffect, useState } from "react";

import { getSupabase } from "@/lib/supabase/client";

export type Profile = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

/**
 * The signed-in account's own profile row.
 *
 * Kept apart from useAuth because it answers a different question: useAuth
 * knows whether there is a session, this knows who that session belongs to.
 * The social features will want to read other people's profiles too, and that
 * belongs in its own hook rather than being bolted onto the session.
 */
export function useProfile(userId: string | null): {
  profile: Profile | null;
  loading: boolean;
} {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (id: string, isCurrent: () => boolean) => {
      const supabase = getSupabase();
      if (!supabase) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .eq("id", id)
        .maybeSingle();

      // Signing out, or switching account, while this was in flight: the
      // answer is about a user we are no longer showing, so drop it rather
      // than letting it overwrite the current one.
      if (!isCurrent()) return;

      setLoading(false);
      if (error || !data) return;
      setProfile({
        id: data.id,
        username: data.username,
        displayName: data.display_name,
        avatarUrl: data.avatar_url,
      });
    },
    [],
  );

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    let live = true;
    // Offline this simply never resolves into a profile, and callers fall back
    // to showing the email. Nothing here is allowed to block the app.
    load(userId, () => live).catch(() => {});
    return () => {
      live = false;
    };
  }, [userId, load]);

  return { profile, loading };
}
