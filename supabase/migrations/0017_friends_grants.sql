-- Unified Prayers -- closing the default EXECUTE grant on the friends helpers.
--
-- 0016 said "who is paired with whom is not public" and meant it in the
-- policies: `friendships` is readable only by the two people in the row. Then
-- it undid that with the grants, and this file is the repair.
--
-- Postgres grants EXECUTE on a new function to PUBLIC unless told otherwise.
-- 0016 revoked that for the twelve write functions and simply added `grant ...
-- to authenticated` for the readers and the three helpers -- which adds a grant
-- without removing the one already there. The helpers take a user id as an
-- argument and are SECURITY DEFINER, so with the anon key alone -- the key that
-- ships inside the browser bundle and is meant to be public -- this answered:
--
--   POST /rest/v1/rpc/friend_ids    {"uid": "<anyone>"}  -> their friends
--   POST /rest/v1/rpc/are_friends   {"a": ..., "b": ...} -> true/false
--   POST /rest/v1/rpc/friend_count  {"uid": "<anyone>"}  -> how many
--
-- and an account that had signed up could get the ids to ask about from
-- `search_people`. The social graph is exactly the thing a scraper wants, and
-- for a prayer app "who does this person pray with" is not a small fact.
--
-- Three different answers below, because the three helpers are reached in
-- three different ways.

-- ------------------------------------------------- internal-only helpers --

-- `are_friends` and `friend_count` are called only from inside other SECURITY
-- DEFINER functions. Those run as the owner, so the caller needs no privilege
-- of their own -- nothing breaks by taking the grant away from everyone, and
-- no client has any business asking either question directly.
--
-- `friend_count` in particular cannot be self-guarded the way `friend_ids` is
-- below: `accept_friend_request` and `accept_friend_invite` both legitimately
-- ask it about the *other* person, to check that account's list is not full.
-- Revoking outright is what makes that safe.
revoke all on function public.are_friends(uuid, uuid) from public, anon, authenticated;
revoke all on function public.friend_count(uuid)      from public, anon, authenticated;

-- ------------------------------------------------------------ friend_ids --

-- This one cannot simply be revoked: the read policies on `intentions` and
-- `intention_prayers` call it, and a policy is evaluated as the role running
-- the query, so `authenticated` must keep EXECUTE or the wall stops loading.
--
-- So it keeps the grant and loses the ability to answer about anybody else.
-- Every caller in 0016 passes the caller's own id already -- the policies and
-- `intentions_feed` take the default, and `pray_for_intention` passes
-- `auth.uid()` -- so the guard costs nothing and closes the direct call.
create or replace function public.friend_ids(uid uuid default auth.uid())
returns table (id uuid)
language sql
security definer
stable
set search_path = ''
as $$
  -- Your own friends, or nothing. The parameter stays so the internal callers
  -- that pass auth.uid() explicitly keep working, but it is no longer a way to
  -- ask about a stranger: SECURITY DEFINER means this reads a table the caller
  -- cannot, and a function like that must never take the subject on trust.
  select f.high_id from public.friendships f
   where f.low_id = uid and uid = auth.uid()
  union all
  select f.low_id  from public.friendships f
   where f.high_id = uid and uid = auth.uid();
$$;

revoke all on function public.friend_ids(uuid) from public, anon;
grant execute on function public.friend_ids(uuid) to authenticated;

-- --------------------------------------------------------- the four reads --

-- Each of these already refuses an anonymous caller on its own -- they either
-- test `auth.uid() is not null` or join on it, so anon got an empty list rather
-- than anyone's data. This is the second lock rather than the first: they are
-- SECURITY DEFINER and read across `prayer_sessions`, whose owner-only policy
-- from 0005 is the thing standing between a streak and everybody. A guard that
-- a later edit could drop should not also be the only grant.
revoke all on function public.friends_overview()         from public, anon;
revoke all on function public.friend_requests_overview() from public, anon;
revoke all on function public.search_people(text)        from public, anon;
revoke all on function public.intentions_feed()          from public, anon;

grant execute on function public.friends_overview()         to authenticated;
grant execute on function public.friend_requests_overview() to authenticated;
grant execute on function public.search_people(text)        to authenticated;
grant execute on function public.intentions_feed()          to authenticated;

-- ------------------------------------------------------------- the rest --

-- The three constants are plain numbers with no subject and no table behind
-- them; they stay callable and there is nothing to leak. `in_couple` and
-- `couple_id_for` from 0009 are deliberately left alone -- 0009 granted them on
-- purpose and the devotion read policy calls `in_couple` as anon.
