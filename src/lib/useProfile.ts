"use client";

import { useCallback, useEffect, useState } from "react";

import { getSupabase } from "@/lib/supabase/client";

export type Profile = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** Whether friends may see this account's streak. See 0016_friends.sql. */
  shareActivity: boolean;
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
  /**
   * Turns activity sharing on or off. Optimistic, because it is a switch: it
   * has to move under the thumb that moved it, and the update policy from 0002
   * is what actually decides. A refusal puts it back.
   */
  setShareActivity: (on: boolean) => Promise<void>;
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
        .select("id, username, display_name, avatar_url, share_activity")
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
        // A profile row written before 0016 has no column at all; friends see
        // the streak by default, which is what the column's own default says.
        shareActivity: data.share_activity ?? true,
      });
    },
    [],
  );

  const setShareActivity = useCallback(
    async (on: boolean) => {
      const supabase = getSupabase();
      if (!supabase || !userId) return;
      setProfile((was) => (was ? { ...was, shareActivity: on } : was));
      const { error } = await supabase
        .from("profiles")
        .update({ share_activity: on })
        .eq("id", userId);
      if (error) setProfile((was) => (was ? { ...was, shareActivity: !on } : was));
    },
    [userId],
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

  return { profile, loading, setShareActivity };
}
