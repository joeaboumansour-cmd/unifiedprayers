-- Unified Prayers -- friends: the people you pray alongside.
--
-- 0002 split the account in two and said why: `profiles` is readable by every
-- signed-in user *because a social feature would need it*, and anything a
-- person would not show a stranger went into `user_private`. This file is that
-- social feature arriving, and it keeps the same discipline -- the permission
-- boundary is the table and the function, never the SELECT list of whatever
-- query the app happens to write.
--
-- Four things live here:
--
--   1. friendships     -- symmetric, one row per pair, no owner
--   2. friend_requests -- asking, and the three ways that ends
--   3. friend_invites  -- a link to send over WhatsApp
--   4. nudges          -- the bell, rate limited in the database
--   5. intentions      -- something to pray for, and who has prayed for it
--
-- Every write goes through a SECURITY DEFINER function, exactly as couples do
-- in 0009. The tables below have read policies and no write policies at all,
-- so the functions are not a convenience layer over an open table -- they are
-- the only door, and each one checks what it needs to before opening.
--
-- The rule that shapes most of it: a friendship is symmetric and unowned.
-- There is no "my friends" list that differs from "their friends" list, no
-- follower/following asymmetry, and no state where A is friends with B but B
-- is not friends with A. Removing a friend removes it for both, the way
-- leaving a couple does.

-- ------------------------------------------------------------ friendships --

-- One row per pair, enforced by ordering the two ids rather than by a pair of
-- mirrored rows. `low_id < high_id` plus the composite primary key is the
-- whole of "friends once, symmetric, never duplicated": there is no second
-- row to keep in step, and no way to insert the same pair the other way round.
--
-- The cost is that every read wants both columns -- hence `friend_ids()` below,
-- which every other query in this file goes through instead of writing the
-- `or` by hand.
create table if not exists public.friendships (
  low_id     uuid not null references auth.users (id) on delete cascade,
  high_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (low_id, high_id),
  constraint friendships_ordered check (low_id < high_id)
);

-- The reverse direction. The primary key already indexes (low_id, high_id),
-- so only the other way needs one.
create index if not exists friendships_high_idx
  on public.friendships (high_id);

-- How many people one account may be friends with.
--
-- Not a business rule about friendship -- it is a bound on everything below.
-- `friends_overview()` computes a streak per friend, the intentions feed fans
-- out across the same list, and a nudge is a push notification. All three are
-- fine at a few hundred and none of them are fine at fifty thousand, which is
-- what an unbounded list would let one account build by script.
create or replace function public.friend_limit()
returns integer language sql immutable as $$ select 250 $$;

-- ------------------------------------------------------------- helpers --

-- SECURITY DEFINER so policies and the functions below can ask these without
-- every caller needing to read the tables themselves. Both answer only about
-- the pair they are handed.

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.friendships f
     where f.low_id = least(a, b)
       and f.high_id = greatest(a, b)
  );
$$;

-- Everyone the given account is friends with, as a flat set of ids. The
-- caller's own friends by default, which is what every read in this file wants.
create or replace function public.friend_ids(uid uuid default auth.uid())
returns table (id uuid)
language sql
security definer
stable
set search_path = ''
as $$
  select f.high_id from public.friendships f where f.low_id  = uid
  union all
  select f.low_id  from public.friendships f where f.high_id = uid;
$$;

create or replace function public.friend_count(uid uuid default auth.uid())
returns integer
language sql
security definer
stable
set search_path = ''
as $$
  select count(*)::int from public.friend_ids(uid);
$$;

grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.friend_ids(uuid)        to authenticated;
grant execute on function public.friend_count(uuid)      to authenticated;

-- -------------------------------------------------------- friend requests --

-- A request that has not been answered yet, or one that was turned down.
--
-- The primary key is the direction, so one person cannot queue five requests
-- at the same account. A declined request keeps its row rather than vanishing:
-- that is what stops someone re-asking the moment they are refused, and it is
-- deliberately not a block -- see `send_friend_request`, which lets the same
-- request through again after a cooling-off period.
create table if not exists public.friend_requests (
  from_id     uuid not null references auth.users (id) on delete cascade,
  to_id       uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- Null while the request is still waiting to be answered.
  declined_at timestamptz,
  primary key (from_id, to_id),
  constraint friend_requests_not_self check (from_id <> to_id)
);

-- "What is waiting for me" -- the badge on the tab, and the top of the page.
create index if not exists friend_requests_inbox_idx
  on public.friend_requests (to_id)
  where declined_at is null;

-- How long a refusal stands before the same person may ask again. Long enough
-- that "no" is not a button somebody taps past, short enough that a request
-- declined by accident is recoverable within a fortnight.
create or replace function public.friend_request_cooloff()
returns interval language sql immutable as $$ select interval '14 days' $$;

-- --------------------------------------------------------- invite links --

-- The code behind a WhatsApp invitation.
--
-- Unlike a couple's code, this one is not typed in -- it travels inside a URL
-- that the recipient taps, and redeeming it makes a friendship outright rather
-- than a request to approve. That is the whole point: the person sending it
-- has already decided, and asking them to then approve a request they caused
-- is a second step for nothing.
--
-- It is also the risk. A link forwarded on to a group chat is a link anyone in
-- that group can redeem, and they arrive as a friend rather than as a request.
-- Three things bound that, and none of them are "trust the recipient":
--
--   * `max_uses`, small by default -- a link is for the handful of people it
--     was sent to, not a public join button;
--   * `expires_at`, so a link resting in an old thread stops working;
--   * one open code per account, revocable from the app at any moment, so
--     "I think that went to the wrong chat" has an answer that takes one tap.
--
-- The code is long enough not to be guessable: 10 characters from a 28-letter
-- alphabet is ~48 bits, which is not something anyone walks into by trying.
create table if not exists public.friend_invites (
  code       text primary key check (code ~ '^[A-HJ-NP-RT-Z2-46-9]{10}$'),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  max_uses   integer not null default 5 check (max_uses between 1 and 25),
  uses       integer not null default 0 check (uses >= 0),
  revoked_at timestamptz
);

-- One live link per account. Asking for another replaces it, which is what
-- makes "revoke" and "regenerate" the same gesture.
create unique index if not exists friend_invites_one_open
  on public.friend_invites (owner_id)
  where revoked_at is null;

-- ------------------------------------------------------------- the bell --

-- One tap on the bell beside a friend's name.
--
-- The rate limit is the feature. A bell that can be rung twice in a row is a
-- way to pester somebody, and a prayer app is the last place that should be
-- possible -- so "once an hour per friend" is enforced twice over, by two
-- mechanisms that fail in different directions:
--
--   * `hour_bucket` + the unique index below is the race guard. Two taps
--     landing in the same millisecond cannot both insert, whatever the
--     function around them does.
--   * the interval check inside `nudge_friend` is the actual rule, because a
--     clock-hour bucket would let 10:59 and 11:01 both through.
--
-- date_trunc on a timestamptz is STABLE, not IMMUTABLE -- it depends on the
-- session's TimeZone -- and a generated column needs immutability. Converting
-- to a plain timestamp at UTC first gives the immutable two-argument form. The
-- bucket is never read by the app; it exists only to be unique.
create table if not exists public.friend_nudges (
  from_id    uuid not null references auth.users (id) on delete cascade,
  to_id      uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  hour_bucket timestamp generated always as
    (date_trunc('hour', created_at at time zone 'UTC')) stored,
  constraint friend_nudges_not_self check (from_id <> to_id)
);

create unique index if not exists friend_nudges_once_an_hour
  on public.friend_nudges (from_id, to_id, hour_bucket);

-- "When did I last ring this person" -- asked once per friend by the overview.
create index if not exists friend_nudges_pair_idx
  on public.friend_nudges (from_id, to_id, created_at desc);

-- --------------------------------------------------------- intentions --

-- Something to pray for, shared with your friends.
--
-- Capped at 280 characters on purpose. This is an intention -- "my mother's
-- surgery on Thursday" -- and not a status feed; the limit is what keeps it
-- one, and it is also what makes the card on the page a fixed, readable size.
--
-- Everything here expires. An intention is tied to a moment, and a wall that
-- accumulates for three years is a wall nobody reads; `expires_at` means the
-- feed stays current with no one having to tidy it.
create table if not exists public.intentions (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references auth.users (id) on delete cascade,
  body       text not null check (length(trim(body)) between 1 and 280),
  created_at timestamptz not null default now(),
  -- Set by the author when it has been answered, or when they simply want it
  -- off the wall. Kept rather than deleted so the people who prayed for it can
  -- still be told it closed.
  closed_at  timestamptz,
  expires_at timestamptz not null default now() + interval '30 days'
);

create index if not exists intentions_author_idx
  on public.intentions (author_id, created_at desc);
-- The feed's own query: everyone's newest first, filtered to friends in SQL.
create index if not exists intentions_live_idx
  on public.intentions (created_at desc)
  where closed_at is null;

-- How many intentions one account may post in a day. The wall notifies every
-- friend, so this is the ceiling on how loud one person can be.
create or replace function public.intention_daily_limit()
returns integer language sql immutable as $$ select 5 $$;

-- "I prayed for this." One row per person per intention, so the count is
-- people rather than taps and pressing it twice changes nothing.
create table if not exists public.intention_prayers (
  intention_id uuid not null references public.intentions (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (intention_id, user_id)
);

create index if not exists intention_prayers_user_idx
  on public.intention_prayers (user_id);

-- ------------------------------------------------- the activity opt-out --

-- Whether friends may see this account's streak and whether it prayed today.
--
-- On by default, because a streak nobody can see is most of the point of
-- having friends in a prayer app, and off in one tap from Settings. It lives
-- on `profiles` rather than `user_private` deliberately: it is not a secret,
-- it is a flag the friends list has to read to know what to draw.
--
-- What it gates is narrow and stays narrow. Even with it on, a friend sees two
-- numbers -- a streak, and whether today is counted. Never what was prayed,
-- never when, never the log. `prayer_sessions` keeps its owner-only policy
-- from 0005 untouched, and nothing below relaxes it; the aggregates come out
-- of a SECURITY DEFINER function that returns counts and nothing else.
alter table public.profiles
  add column if not exists share_activity boolean not null default true;

-- ============================================================ reads =========

-- Everything the friends list draws, in one call.
--
-- One function rather than a query per card: the page shows a name, a streak,
-- whether they have prayed today and whether the bell is available, and asking
-- for those separately is four round trips per friend on a phone that may be
-- on a train. It is SECURITY DEFINER because `prayer_sessions` is owner-only
-- and must stay that way -- this reaches across that boundary and hands back
-- exactly two derived facts, for people who are actually friends, who have not
-- opted out.
create or replace function public.friends_overview()
returns table (
  user_id       uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  friends_since timestamptz,
  -- False when that friend has turned activity sharing off. The two columns
  -- below are then 0 and false, and the app draws no streak rather than a
  -- zero -- "not sharing" and "has not prayed" are different things.
  shares        boolean,
  streak        integer,
  prayed_today  boolean,
  -- Whether the bell is available for this friend right now, and when it was
  -- last rung. Computed here so the button is drawn in the state the database
  -- will actually agree to, rather than one the client guessed at.
  can_nudge     boolean,
  last_nudge_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    f.created_at,
    p.share_activity,
    case when p.share_activity
         then public.streak_for(p.id, (now() at time zone 'UTC')::date)
         else 0 end,
    case when p.share_activity then exists (
           select 1 from public.prayer_sessions s
            where s.user_id = p.id
              -- Their calendar day, not ours, and we do not know their
              -- timezone -- so "today" is either of the two dates it could be
              -- anywhere on earth. A dot that lights an hour early is a much
              -- smaller wrong than one that goes dark while they are praying.
              and s.local_date >= (now() at time zone 'UTC')::date - 1
         ) else false end,
    not exists (
      select 1 from public.friend_nudges n
       where n.from_id = auth.uid() and n.to_id = p.id
         and n.created_at > now() - interval '1 hour'
    ),
    (select max(n.created_at) from public.friend_nudges n
      where n.from_id = auth.uid() and n.to_id = p.id)
  from public.friendships f
  join public.profiles p
    on p.id = case when f.low_id = auth.uid() then f.high_id else f.low_id end
 where auth.uid() in (f.low_id, f.high_id)
 order by p.display_name nulls last, p.username;
$$;

-- Both directions of the request queue, with the names to draw them.
--
-- `profiles` is readable by any signed-in account, so nothing here is newly
-- exposed -- but PostgREST cannot embed it, since these columns reference
-- auth.users rather than profiles, and doing the join in the client is a
-- request per row.
create or replace function public.friend_requests_overview()
returns table (
  direction    text,
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  created_at   timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select 'incoming', p.id, p.username, p.display_name, p.avatar_url, r.created_at
    from public.friend_requests r
    join public.profiles p on p.id = r.from_id
   where r.to_id = auth.uid() and r.declined_at is null
  union all
  -- Outgoing includes the ones that were turned down: the sender sees them as
  -- "not accepted" and can withdraw them. Nobody is told they were declined
  -- rather than ignored -- that distinction belongs to the person who made it.
  select 'outgoing', p.id, p.username, p.display_name, p.avatar_url, r.created_at
    from public.friend_requests r
    join public.profiles p on p.id = r.to_id
   where r.from_id = auth.uid() and r.declined_at is null
   order by 6 desc;
$$;

-- Finding somebody by name, with what they already are to you.
--
-- The relation column is why this is a function. Without it the app gets a
-- list of strangers and has to ask, per row, whether each one is already a
-- friend or has a request outstanding -- and then draws an "Add" button on
-- people it is already waiting to hear back from.
create or replace function public.search_people(q text)
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  -- 'friend' | 'incoming' | 'outgoing' | 'none'
  relation     text
)
language sql
security definer
stable
set search_path = ''
as $$
  with needle as (
    select lower(trim(coalesce(q, ''))) as s
  )
  select
    p.id, p.username, p.display_name, p.avatar_url,
    case
      when public.are_friends(auth.uid(), p.id) then 'friend'
      when exists (
        select 1 from public.friend_requests r
         where r.from_id = auth.uid() and r.to_id = p.id and r.declined_at is null
      ) then 'outgoing'
      when exists (
        select 1 from public.friend_requests r
         where r.from_id = p.id and r.to_id = auth.uid() and r.declined_at is null
      ) then 'incoming'
      else 'none'
    end
  from public.profiles p, needle
 where auth.uid() is not null
   -- Two characters minimum. A one-letter search is a request to page through
   -- the whole user table, which is not a search.
   and length(needle.s) >= 2
   and p.id <> auth.uid()
   and (
     -- Usernames match from the start -- they are handles, and someone typing
     -- "jo" means "starts with jo". Display names match anywhere, because they
     -- are real names and the surname is as good a thing to search for as the
     -- first.
     p.username like needle.s || '%'
     or lower(coalesce(p.display_name, '')) like '%' || needle.s || '%'
   )
 -- Exact handle first, then handle prefix, then the rest. Someone who typed a
 -- username in full should not have to scroll past a partial name match.
 order by
   (p.username = needle.s) desc,
   (p.username like needle.s || '%') desc,
   p.username
 limit 20;
$$;

-- The intentions wall: your friends' open intentions, and your own.
--
-- Your own are included because the wall is also where you check on what you
-- posted -- how many people have prayed for it, and the button that closes it.
create or replace function public.intentions_feed()
returns table (
  id           uuid,
  author_id    uuid,
  username     text,
  display_name text,
  avatar_url   text,
  body         text,
  created_at   timestamptz,
  mine         boolean,
  -- How many people have prayed for it, and whether you are one of them.
  prayed_count integer,
  i_prayed     boolean
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    i.id, i.author_id, p.username, p.display_name, p.avatar_url,
    i.body, i.created_at,
    i.author_id = auth.uid(),
    (select count(*)::int from public.intention_prayers x where x.intention_id = i.id),
    exists (
      select 1 from public.intention_prayers x
       where x.intention_id = i.id and x.user_id = auth.uid()
    )
  from public.intentions i
  join public.profiles p on p.id = i.author_id
 where auth.uid() is not null
   and i.closed_at is null
   and i.expires_at > now()
   and (
     i.author_id = auth.uid()
     or i.author_id in (select public.friend_ids())
   )
 order by i.created_at desc
 limit 50;
$$;

grant execute on function public.friends_overview()          to authenticated;
grant execute on function public.friend_requests_overview()  to authenticated;
grant execute on function public.search_people(text)         to authenticated;
grant execute on function public.intentions_feed()           to authenticated;

-- ============================================================ writes ========

-- Every one of these raises with a distinct errcode per reason, so the app can
-- say which thing happened instead of "something went wrong". The mapping is
-- mirrored in src/lib/useFriends.ts.
--
--   28000  not signed in
--   P0001  refused: your own account, a cool-off still running, a limit hit
--   P0002  no such thing: bad code, expired, gone
--   23505  already: already friends, already asked, bell already rung

create or replace function public.send_friend_request(target uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  prev public.friend_requests;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  if target is null or target = uid then
    raise exception 'that is your own account' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = target) then
    raise exception 'no such account' using errcode = 'P0002';
  end if;
  if public.are_friends(uid, target) then
    raise exception 'already friends' using errcode = '23505';
  end if;
  if public.friend_count(uid) >= public.friend_limit() then
    raise exception 'friend list is full' using errcode = 'P0001';
  end if;

  -- They asked first. Two people tapping Add on each other is two people who
  -- have agreed, so it becomes a friendship here rather than leaving each of
  -- them waiting on the other to notice a request.
  select * into prev
    from public.friend_requests r
   where r.from_id = target and r.to_id = uid and r.declined_at is null
   for update;

  if prev.from_id is not null then
    perform public.accept_friend_request(target);
    return 'friends';
  end if;

  -- Our own earlier request to them. Still pending means nothing to do;
  -- declined means it depends how long ago.
  select * into prev
    from public.friend_requests r
   where r.from_id = uid and r.to_id = target
   for update;

  if prev.from_id is not null then
    if prev.declined_at is null then
      raise exception 'already asked' using errcode = '23505';
    end if;
    if prev.declined_at > now() - public.friend_request_cooloff() then
      raise exception 'asked too recently' using errcode = 'P0001';
    end if;
    update public.friend_requests
       set created_at = now(), declined_at = null
     where from_id = uid and to_id = target;
    return 'sent';
  end if;

  insert into public.friend_requests (from_id, to_id) values (uid, target);
  return 'sent';
end;
$$;

create or replace function public.accept_friend_request(from_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;

  -- The request is the authorisation. Without this line an account could make
  -- itself a friend of anyone it liked by calling accept with their id.
  if not exists (
    select 1 from public.friend_requests r
     where r.from_id = from_user and r.to_id = uid and r.declined_at is null
  ) then
    raise exception 'no such request' using errcode = 'P0002';
  end if;

  if public.friend_count(uid) >= public.friend_limit()
     or public.friend_count(from_user) >= public.friend_limit() then
    raise exception 'friend list is full' using errcode = 'P0001';
  end if;

  insert into public.friendships (low_id, high_id)
  values (least(uid, from_user), greatest(uid, from_user))
  on conflict do nothing;

  -- Both directions go, not just the one that was accepted: a stale request
  -- pointing the other way would otherwise sit in somebody's inbox offering to
  -- befriend a person they are already friends with.
  delete from public.friend_requests
   where (from_id = from_user and to_id = uid)
      or (from_id = uid and to_id = from_user);
end;
$$;

-- Turning one down. The row stays, marked, so the cool-off in
-- `send_friend_request` has something to measure from -- and so the sender is
-- not told, which is the point of the row staying rather than the sender
-- getting a notification that says no.
create or replace function public.decline_friend_request(from_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  update public.friend_requests
     set declined_at = now()
   where from_id = from_user and to_id = uid and declined_at is null;
end;
$$;

-- Withdrawing your own. Deleted outright rather than marked: it is the
-- sender's own row and there is no one to protect from being re-asked.
create or replace function public.cancel_friend_request(to_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  delete from public.friend_requests where from_id = uid and to_id = to_user;
end;
$$;

-- Unfriending, for both people at once -- the same shape as leaving a couple.
-- Their intentions leave your wall and yours leave theirs the moment this
-- returns, because the feed is filtered by friendship rather than by a copy.
create or replace function public.remove_friend(other uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  delete from public.friendships
   where low_id = least(uid, other) and high_id = greatest(uid, other);
  -- So neither is left holding a request that would re-add them silently.
  delete from public.friend_requests
   where (from_id = uid and to_id = other) or (from_id = other and to_id = uid);
end;
$$;

-- ------------------------------------------------------- the invite link --

create or replace function public.create_friend_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid       uuid := auth.uid();
  alphabet  text := 'ABCDEFGHJKLMNPQRTUVWXYZ23469';
  candidate text;
  i         integer;
  attempt   integer := 0;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;

  -- Asking again replaces the old link rather than accumulating them, which is
  -- also how a link sent to the wrong chat is killed.
  update public.friend_invites
     set revoked_at = now()
   where owner_id = uid and revoked_at is null;

  loop
    attempt := attempt + 1;
    candidate := '';
    for i in 1..10 loop
      candidate := candidate
        || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    begin
      insert into public.friend_invites (code, owner_id) values (candidate, uid);
      return candidate;
    exception when unique_violation then
      if attempt > 12 then
        raise exception 'could not allocate a code';
      end if;
    end;
  end loop;
end;
$$;

create or replace function public.revoke_friend_invite()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  update public.friend_invites
     set revoked_at = now()
   where owner_id = auth.uid() and revoked_at is null;
end;
$$;

-- Redeeming a link. Returns the id of the person whose link it was, so the app
-- can say whose invitation it just accepted.
create or replace function public.accept_friend_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  norm text := upper(regexp_replace(coalesce(invite_code, ''), '[^A-Za-z0-9]', '', 'g'));
  inv  public.friend_invites;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;

  -- Locked, so two people redeeming the last remaining use at the same moment
  -- cannot both be counted.
  select * into inv
    from public.friend_invites fi
   where fi.code = norm
     and fi.revoked_at is null
     and fi.expires_at > now()
     and fi.uses < fi.max_uses
   for update;

  if inv.code is null then
    raise exception 'no such link' using errcode = 'P0002';
  end if;
  if inv.owner_id = uid then
    raise exception 'that is your own link' using errcode = 'P0001';
  end if;
  if public.are_friends(uid, inv.owner_id) then
    -- Not an error worth a scary message, but the caller needs to know no new
    -- friendship was made. It answers with the owner either way.
    raise exception 'already friends' using errcode = '23505';
  end if;
  if public.friend_count(uid) >= public.friend_limit()
     or public.friend_count(inv.owner_id) >= public.friend_limit() then
    raise exception 'friend list is full' using errcode = 'P0001';
  end if;

  insert into public.friendships (low_id, high_id)
  values (least(uid, inv.owner_id), greatest(uid, inv.owner_id))
  on conflict do nothing;

  update public.friend_invites set uses = uses + 1 where code = inv.code;

  -- Either of them may have asked the other the hard way first.
  delete from public.friend_requests
   where (from_id = uid and to_id = inv.owner_id)
      or (from_id = inv.owner_id and to_id = uid);

  return inv.owner_id;
end;
$$;

-- ----------------------------------------------------------- the bell --

-- Records one ring and refuses a second inside the hour.
--
-- It records but does not send: delivering a push needs the VAPID private key,
-- which lives on the server and nowhere else. /api/friends/nudge calls this
-- first and only sends if it returns -- so the rate limit is enforced here,
-- in the database, and not by the route that happens to call it.
create or replace function public.nudge_friend(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  if not public.are_friends(uid, target) then
    raise exception 'not friends' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.friend_nudges n
     where n.from_id = uid and n.to_id = target
       and n.created_at > now() - interval '1 hour'
  ) then
    raise exception 'rung too recently' using errcode = '23505';
  end if;

  -- The unique index on the hour bucket is the race guard behind the check
  -- above; a concurrent second tap lands here and raises the same errcode.
  insert into public.friend_nudges (from_id, to_id) values (uid, target);
end;
$$;

-- --------------------------------------------------------- intentions --

create or replace function public.post_intention(body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  text_in text := trim(coalesce(body, ''));
  new_id uuid;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  if length(text_in) = 0 then
    raise exception 'nothing to post' using errcode = 'P0001';
  end if;
  if length(text_in) > 280 then
    text_in := left(text_in, 280);
  end if;
  if (
    select count(*) from public.intentions i
     where i.author_id = uid and i.created_at > now() - interval '1 day'
  ) >= public.intention_daily_limit() then
    raise exception 'that is enough for one day' using errcode = 'P0001';
  end if;

  insert into public.intentions (author_id, body)
  values (uid, text_in)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.close_intention(intention uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  -- The author's own, and nobody else's.
  update public.intentions
     set closed_at = now()
   where id = intention and author_id = auth.uid() and closed_at is null;
end;
$$;

-- "I prayed for this." Idempotent, and it answers with the author's id so the
-- route above it knows who to tell -- the whole point of the button is that
-- the person who asked finds out somebody did.
create or replace function public.pray_for_intention(intention uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid    uuid := auth.uid();
  author uuid;
  fresh  boolean;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;

  select i.author_id into author
    from public.intentions i
   where i.id = intention
     and i.closed_at is null
     and i.expires_at > now()
     and (i.author_id = uid or i.author_id in (select public.friend_ids(uid)));

  if author is null then
    raise exception 'no such intention' using errcode = 'P0002';
  end if;

  insert into public.intention_prayers (intention_id, user_id)
  values (intention, uid)
  on conflict do nothing;
  -- Whether this tap was the first. Tapping twice must not notify twice.
  get diagnostics fresh = row_count;

  if not fresh or author = uid then
    return null;
  end if;
  return author;
end;
$$;

-- ------------------------------------------------------------- grants --

revoke all on function public.send_friend_request(uuid)    from public, anon;
revoke all on function public.accept_friend_request(uuid)  from public, anon;
revoke all on function public.decline_friend_request(uuid) from public, anon;
revoke all on function public.cancel_friend_request(uuid)  from public, anon;
revoke all on function public.remove_friend(uuid)          from public, anon;
revoke all on function public.create_friend_invite()       from public, anon;
revoke all on function public.revoke_friend_invite()       from public, anon;
revoke all on function public.accept_friend_invite(text)   from public, anon;
revoke all on function public.nudge_friend(uuid)           from public, anon;
revoke all on function public.post_intention(text)         from public, anon;
revoke all on function public.close_intention(uuid)        from public, anon;
revoke all on function public.pray_for_intention(uuid)     from public, anon;

grant execute on function public.send_friend_request(uuid)    to authenticated;
grant execute on function public.accept_friend_request(uuid)  to authenticated;
grant execute on function public.decline_friend_request(uuid) to authenticated;
grant execute on function public.cancel_friend_request(uuid)  to authenticated;
grant execute on function public.remove_friend(uuid)          to authenticated;
grant execute on function public.create_friend_invite()       to authenticated;
grant execute on function public.revoke_friend_invite()       to authenticated;
grant execute on function public.accept_friend_invite(text)   to authenticated;
grant execute on function public.nudge_friend(uuid)           to authenticated;
grant execute on function public.post_intention(text)         to authenticated;
grant execute on function public.close_intention(uuid)        to authenticated;
grant execute on function public.pray_for_intention(uuid)     to authenticated;

-- ================================================================ RLS ======

alter table public.friendships       enable row level security;
alter table public.friend_requests   enable row level security;
alter table public.friend_invites    enable row level security;
alter table public.friend_nudges     enable row level security;
alter table public.intentions        enable row level security;
alter table public.intention_prayers enable row level security;

drop policy if exists "friendships: read own"      on public.friendships;
drop policy if exists "requests: read own"         on public.friend_requests;
drop policy if exists "invites: read own"          on public.friend_invites;
drop policy if exists "nudges: read own"           on public.friend_nudges;
drop policy if exists "intentions: read friends"   on public.intentions;
drop policy if exists "intention prayers: read"    on public.intention_prayers;

-- Your own friendships only. Who else is friends with whom is not public --
-- the social graph is the thing a scraper would want, and there is no screen
-- in this app that shows a friend's friends.
create policy "friendships: read own" on public.friendships
  for select to authenticated
  using (auth.uid() in (low_id, high_id));

-- Requests pointing at you or sent by you. A declined one stays readable to
-- the person who sent it, which is how it draws as "waiting" rather than
-- disappearing and inviting them to send it again.
create policy "requests: read own" on public.friend_requests
  for select to authenticated
  using (auth.uid() in (from_id, to_id));

-- Your own link, so the page can show the URL it is about to share. Never
-- anybody else's: the code IS the invitation, and a readable list of other
-- people's codes would make every link in the system redeemable.
create policy "invites: read own" on public.friend_invites
  for select to authenticated
  using (owner_id = auth.uid());

-- Both sides: the bell you rang, and the bell rung at you.
create policy "nudges: read own" on public.friend_nudges
  for select to authenticated
  using (auth.uid() in (from_id, to_id));

-- The wall, as a policy rather than as a filter in the feed function. The
-- function is what the app calls, but this is what makes the table itself
-- safe -- `intentions` is reachable from PostgREST with the anon key like
-- every other table, and a read policy that trusted the function would be no
-- policy at all.
create policy "intentions: read friends" on public.intentions
  for select to authenticated
  using (
    author_id = auth.uid()
    or (
      expires_at > now()
      and author_id in (select public.friend_ids())
    )
  );

-- Who prayed for an intention you can see. Bounded by the same rule, one level
-- up: if the intention is not yours or a friend's, its prayers are not visible
-- either.
create policy "intention prayers: read" on public.intention_prayers
  for select to authenticated
  using (
    exists (
      select 1 from public.intentions i
       where i.id = intention_id
         and (i.author_id = auth.uid() or i.author_id in (select public.friend_ids()))
    )
  );

-- No insert, update or delete policy on any of the six. The functions above
-- are the only way in, and each of them checks the thing that matters before
-- it writes: a request before a friendship, friendship before a bell, an hour
-- before a second bell.
