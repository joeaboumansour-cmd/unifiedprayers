-- Unified Prayers -- the morning message becomes a daily verse.
--
-- 0006 sent each device a greeting chosen against its streak. That is replaced
-- by a verse of scripture, chosen for what the reader said they are carrying:
-- money, envy, grief, fear, and so on -- src/data/verses/topics.json. The
-- schedule is the same one (morning_hour, last_morning, the same hourly sweep
-- and the same app_settings switch); only what is sent has changed.
--
-- The words are never stored here. The sender picks a verse from the device's
-- id, its topics and its own date, and the app asks the same function for the
-- same answer, so nothing needs to remember what was sent.

-- Which topics this device wants verses about. Null means all of them, which
-- is what every existing subscriber gets without doing anything. An empty
-- array is read the same way: somebody who unticks everything has not asked
-- for silence -- that is what the hour picker's "off" is for.
alter table public.push_subscriptions
  add column if not exists verse_topics text[];

do $$
begin
  alter table public.push_subscriptions
    add constraint push_subscriptions_verse_topics_check
    check (verse_topics is null or cardinality(verse_topics) <= 64);
exception
  when duplicate_object then null;
end $$;

-- The morning sweep, now returning the topics instead of a streak.
--
-- Dropped first because the columns it returns change, which `create or
-- replace` cannot do. The streak is no longer computed per device each
-- morning; streak_for() itself stays, since nothing is gained by removing a
-- function that still agrees with the home screen.
drop function if exists public.due_morning_messages();

create function public.due_morning_messages()
returns table (
  id           uuid,
  endpoint     text,
  p256dh       text,
  auth         text,
  tz           text,
  user_id      uuid,
  verse_topics text[]
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    s.id,
    s.endpoint,
    s.p256dh,
    s.auth,
    s.tz,
    s.user_id,
    s.verse_topics
  from public.push_subscriptions s
  where s.enabled
    and s.morning_hour is not null
    and extract(hour from (now() at time zone public.safe_tz(s.tz))) = s.morning_hour
    and (
      s.last_morning is null
      or s.last_morning < (now() at time zone public.safe_tz(s.tz))::date
    );
$$;

-- Secret key only, as before: the rows carry every subscriber's endpoint.
revoke all on function public.due_morning_messages() from public, anon, authenticated;
