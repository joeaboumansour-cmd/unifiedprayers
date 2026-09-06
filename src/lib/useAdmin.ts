"use client";

import { useEffect, useState } from "react";

import { getSupabase } from "@/lib/supabase/client";

/**
 * Whether the signed-in account is an admin.
 *
 * This decides whether the admin tab is rendered, and nothing more. It is not a
 * security boundary and is not treated as one: the row it reads is protected by
 * RLS, every admin write is checked again by a policy, and every admin route
 * checks the caller server-side. Someone who forces this to `true` in a console
 * gets a tab whose every button is refused.
 *
 * Undefined while unknown, so the tab bar does not flash a fifth tab in and out
 * on every launch. It settles to false for signed-out and non-admin alike.
 */
export function useAdmin(userId: string | null): boolean | undefined {
  const [isAdmin, setIsAdmin] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setIsAdmin(false);
      return;
    }

    let live = true;
    supabase
      .from("app_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live) return;
        // Offline counts as not an admin. The admin tab needs the network for
        // every single thing it does, so hiding it is the honest answer.
        setIsAdmin(!error && Boolean(data));
      });

    return () => {
      live = false;
    };
  }, [userId]);

  return isAdmin;
}
