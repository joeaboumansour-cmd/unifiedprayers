import {
  badRequest,
  callerClient,
  callerId,
  denied,
  json,
  serviceClient,
  unconfigured,
} from "@/lib/server/supabase";
import { isPushConfigured, sendToSubscriptions, subscriptionsFor } from "@/lib/server/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Becoming friends, in the three ways it happens, and telling the other person.
 *
 *   ask     — send_friend_request.    They are told someone asked.
 *   accept  — accept_friend_request.  They are told they were accepted.
 *   redeem  — accept_friend_invite.   They are told their link was used.
 *
 * One route because they are one shape, the same way the two intention actions
 * share theirs: call a function in 0016_friends.sql as the person who tapped,
 * and if it agrees, send the push that the database has no key to send.
 *
 * Declining is deliberately absent. 0016 keeps the declined row rather than
 * deleting it precisely so the sender is *not* told, and a route that pushed
 * "no" would undo that on purpose.
 *
 * Record first, send second, throughout. A push service having a bad minute
 * must not be able to un-make a friendship that is already in the table, so a
 * failed send is reported in `delivered` and changes nothing else.
 */

type Action = "ask" | "accept" | "redeem";
type Body = { action?: unknown; target?: unknown; code?: unknown };

/**
 * Postgres errcodes to the names useFriends already turns into wording.
 *
 * The same code means different things per action — 23505 is "already
 * friends" when asking and "already friends" when redeeming but reaches the
 * screen as different sentences, and P0001 is a spent cool-off in one and
 * "that is your own link" in another. This is the mapping the client used to
 * do from the raw code; it moved here with the call.
 */
const FAILURES: Record<
  Action,
  { map: Record<string, [string, number]>; fallback: [string, number] }
> = {
  ask: {
    map: {
      "23505": ["already", 409],
      P0001: ["cool-off", 429],
      P0002: ["unknown-person", 404],
      "28000": ["signed-out", 401],
    },
    fallback: ["failed", 400],
  },
  accept: {
    map: {
      "23505": ["already", 409],
      // "friend list is full", worded as the screen has always worded it.
      P0001: ["cool-off", 429],
      P0002: ["unknown-person", 404],
      "28000": ["signed-out", 401],
    },
    fallback: ["failed", 400],
  },
  redeem: {
    map: {
      P0001: ["own-link", 400],
      "23505": ["already", 409],
      "28000": ["signed-out", 401],
    },
    // A code that is revoked, spent, expired or simply wrong all arrive as
    // P0002, and all mean the same thing to the person holding the link.
    fallback: ["expired", 404],
  },
};

/** One person's handle, for a message about them on somebody else's phone. */
async function handleOf(
  service: NonNullable<ReturnType<typeof serviceClient>>,
  uid: string,
): Promise<string> {
  const { data } = await service
    .from("profiles")
    .select("username")
    .eq("id", uid)
    .maybeSingle();

  /* The handle, not the display name.
     Unlike the bell and the intentions wall this needs no scrubbing: a
     username is whatever username_is_valid() allowed, which is three to twenty
     characters of a-z, 0-9 and underscore. There is no whitespace to collapse
     and no second line to forge — and it is the thing the other person will
     search for if they want to see who this is before answering. */
  return data?.username ? `@${data.username}` : "Someone";
}

/** What each event says. `who` is the handle of the person who did it. */
function message(kind: "asked" | "accepted" | "joined", who: string, uid: string) {
  const common = {
    url: "/?tab=friends",
    /* Tagged per actor rather than with one shared tag per kind. Two nudges an
       hour apart are the same event twice and should collapse; two people
       asking are two different people waiting on an answer, and replacing one
       with the other loses somebody. */
    tag: `up-${kind}-${uid}`,
  };

  if (kind === "asked") {
    return {
      ...common,
      title_ar: "طلب صداقة جديد!",
      title_en: "New friend request!",
      body_ar: `${who} أرسل لك طلب صداقة.`,
      body_en: `${who} sent you a friend request.`,
    };
  }
  if (kind === "accepted") {
    return {
      ...common,
      title_ar: "تم قبول طلب الصداقة!",
      title_en: "Friend request accepted!",
      body_ar: `${who} قبل طلب الصداقة.`,
      body_en: `${who} accepted your friend request.`,
    };
  }
  return {
    ...common,
    title_ar: "صديق جديد!",
    title_en: "New friend!",
    body_ar: `${who} انضم إليك عبر رابط الدعوة.`,
    body_en: `${who} joined you through your invite link.`,
  };
}

export async function POST(req: Request): Promise<Response> {
  const service = serviceClient();
  if (!service) return unconfigured();

  const uid = await callerId(req);
  const caller = callerClient(req);
  if (!uid || !caller) return denied();

  let input: Body;
  try {
    input = (await req.json()) as Body;
  } catch {
    return badRequest("bad-json");
  }

  const action = input.action;
  if (action !== "ask" && action !== "accept" && action !== "redeem") {
    return badRequest("bad-action");
  }

  /* Who to tell, and what to tell them. Both are decided by what the database
     did, never by what the request asked for. */
  let tell: string | null = null;
  let kind: "asked" | "accepted" | "joined" = "asked";

  if (action === "ask" || action === "accept") {
    const { target } = input;
    if (typeof target !== "string" || !target) return badRequest("target-required");

    if (action === "ask") {
      const { data: outcome, error } = await caller.rpc("send_friend_request", { target });
      if (error) return fail(action, error.code);

      /* `friends` means they had asked us first and this tap answered them.
         That is an acceptance however it was reached, so they hear the same
         thing they would have heard from the Accept button. */
      tell = target;
      kind = outcome === "friends" ? "accepted" : "asked";
    } else {
      const { error } = await caller.rpc("accept_friend_request", { from_user: target });
      if (error) return fail(action, error.code);

      /* Safe to notify the id the request named: accept_friend_request raises
         P0002 unless a pending request from that person to this caller really
         existed, so getting here is the database confirming the pair. */
      tell = target;
      kind = "accepted";
    }
  } else {
    const { code } = input;
    if (typeof code !== "string" || !code) return badRequest("code-required");

    const { data: owner, error } = await caller.rpc("accept_friend_invite", {
      invite_code: code,
    });
    if (error) return fail(action, error.code);

    // The function answers with whose link it was, which is exactly who to
    // tell — the route never has to guess or look the code up itself.
    tell = typeof owner === "string" ? owner : null;
    kind = "joined";
  }

  if (!tell || !isPushConfigured) return json({ ok: true, delivered: 0 });

  const who = await handleOf(service, uid);
  const subs = await subscriptionsFor(tell);
  const report = await sendToSubscriptions(subs, message(kind, who, uid));

  return json({ ok: true, delivered: report.sent });
}

/** The refusal for an action, in the words that action's screen expects. */
function fail(action: Action, code: string | undefined): Response {
  const { map, fallback } = FAILURES[action];
  const [what, status] = map[code ?? ""] ?? fallback;
  return json({ error: what }, status);
}
