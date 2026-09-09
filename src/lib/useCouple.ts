"use client";

import { useCallback, useEffect, useState } from "react";

import { onForeground } from "@/lib/live";
import { getSupabase } from "@/lib/supabase/client";

/**
 * Whether this account is paired with someone, and the two calls that change
 * that.
 *
 * The state here is a convenience for drawing a screen, never a permission.
 * The couples devotion is locked by the read policy in 0009 — an account that
 * is not half of a couple gets nothing back from the database for that book,
 * whatever this hook happens to be holding. So `paired` going stale costs a
 * lock icon, not a leak.
 *
 * Pairing is the one piece of state in the app that a *different* device
 * changes: the other person types your code in on their phone, and nothing
 * happens on yours. So this re-asks on every foreground, the same beat as the
 * rest of the app. Without that, the partner who handed the code over stays
 * "alone" until they happen to relaunch — which on an installed PWA can be
 * days.
 *
 * Nothing is cached to localStorage, deliberately. Everything else the app
 * keeps offline is content; this is a relationship between two accounts, and
 * an unpairing that a phone had not noticed would show a card that then
 * refuses to open. Signed out, the answer is simply "no", with no request.
 */

export type CoupleStatus =
  | "loading"
  /** No project configured, or nobody signed in. */
  | "signed-out"
  | "alone"
  | "paired";

export type Couple = {
  status: CoupleStatus;
  paired: boolean;
  /** The partner's display name or username, once paired. */
  partnerName: string | null;
  /**
   * The couple's id, once paired, and null otherwise.
   *
   * Exported because what the database will hand over for the couples book
   * changes the moment this changes, and the devotion cache has to be able to
   * tell "no page today" from "no page for who I was when I asked".
   */
  coupleId: string | null;
  /** This account's open pairing code, if one has been asked for. */
  code: string | null;
  /** Asks for a code, replacing any previous one. Returns it, or null. */
  invite: () => Promise<string | null>;
  /** Redeems the other person's code. Resolves to an error key, or null. */
  join: (code: string) => Promise<JoinError | null>;
  /** Dissolves the link — for both people. */
  leave: () => Promise<boolean>;
  refresh: () => void;
};

/** What went wrong, as something the caller can turn into its own wording. */
export type JoinError = "empty" | "unknown" | "own" | "already" | "failed";

export function useCouple(userId: string | null): Couple {
  const [status, setStatus] = useState<CoupleStatus>("loading");
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !userId) {
      setStatus("signed-out");
      setPartnerName(null);
      setCoupleId(null);
      setCode(null);
      return;
    }

    let live = true;
    // Only the first ask shows "loading". A foreground re-ask that dropped
    // back through it would report `paired: false` for the length of a round
    // trip, flickering the card to locked and back on every resume.
    setStatus((was) => (was === "loading" || was === "signed-out" ? "loading" : was));

    (async () => {
      // Both halves of the couple, or nothing. The policy scopes this to the
      // caller's own couple, so "every row I can see" is already "us".
      const { data: members } = await supabase
        .from("couple_members")
        .select("user_id, couple_id");
      if (!live) return;

      const partner = (members ?? []).find((m) => m.user_id !== userId);

      if (!partner) {
        setStatus("alone");
        setPartnerName(null);
        setCoupleId(null);
        // Only meaningful while unpaired: an open code is what the screen
        // shows someone waiting for their partner to type it in.
        const { data: invites } = await supabase
          .from("couple_invites")
          .select("code, expires_at, accepted_at")
          .is("accepted_at", null)
          .gt("expires_at", new Date().toISOString())
          .limit(1);
        if (!live) return;
        setCode(invites?.[0]?.code ?? null);
        return;
      }

      setCode(null);
      setCoupleId(partner.couple_id);
      setStatus("paired");

      // A separate read because profiles is its own table with its own policy.
      // A partner whose profile has not been created yet is still a partner,
      // so a failure here does not undo the pairing above.
      const { data: prof } = await supabase
        .from("profiles")
        .select("username, display_name")
        .eq("id", partner.user_id)
        .maybeSingle();
      if (!live) return;
      setPartnerName(prof?.display_name || prof?.username || null);
    })().catch(() => {
      // Offline. "Alone" is the safe answer: it locks the card rather than
      // showing one that would then refuse to open.
      if (live) setStatus("alone");
    });

    return () => {
      live = false;
    };
  }, [userId, tick]);

  /*
   * The other half of this pair is on another phone. Coming back to the
   * foreground is the only signal this device gets that they have acted, so it
   * is the one that has to re-ask. Five minutes is the beat the devotions
   * already use; pairing is not urgent in itself, but being wrong about it
   * locks a book.
   *
   * Its own effect, depending on the account and nothing else. Subscribing
   * inside the effect above would tear the listener down and rebuild it on
   * every answer, restarting the interval each time it fired.
   */
  useEffect(() => {
    if (!userId || !getSupabase()) return;
    return onForeground(refresh, 5 * 60 * 1000);
  }, [userId, refresh]);

  const invite = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase.rpc("create_couple_invite");
    if (error || typeof data !== "string") return null;
    setCode(data);
    return data;
  }, []);

  const join = useCallback(
    async (raw: string): Promise<JoinError | null> => {
      const supabase = getSupabase();
      if (!supabase) return "failed";
      const cleaned = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      if (cleaned.length !== 6) return "empty";

      const { error } = await supabase.rpc("accept_couple_invite", {
        invite_code: cleaned,
      });
      if (!error) {
        refresh();
        return null;
      }
      // The function raises with a code per reason, so the screen can say
      // which of them happened rather than "something went wrong".
      const map: Record<string, JoinError> = {
        P0002: "unknown",
        P0001: "own",
        "23505": "already",
      };
      return map[error.code ?? ""] ?? "failed";
    },
    [refresh],
  );

  const leave = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase.rpc("leave_couple");
    if (error) return false;
    setCode(null);
    refresh();
    return true;
  }, [refresh]);

  return {
    status,
    paired: status === "paired",
    partnerName,
    coupleId,
    code,
    invite,
    join,
    leave,
    refresh,
  };
}
