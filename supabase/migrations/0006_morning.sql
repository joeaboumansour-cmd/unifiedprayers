-- Unified Prayers -- the morning message.
--
-- A second scheduled push, separate from the nightly reminder in 0004 and
-- deliberately not a replacement for it. The two say different things: the
-- reminder is a nudge at an hour someone chose for praying, this one is a
-- greeting at the start of the day that knows whether there is a streak to
-- speak to. Someone with both set gets both, and either can be turned off on
-- its own in Settings.
--
-- What is new here is that the copy is not one stored string. It is chosen at
-- send time from a pool in the app, per device, against the streak the account
-- actually has -- so this migration adds the schedule and the streak query,
-- and the words themselves live in src/lib/server/morningCopy.ts.

-- --------------------------------------------------------------- schedule --

-- Default 8, which backfills every device already subscribed: this is on by
-- default, at 8am in each device's own timezone. Nullable, and null is how
-- Settings turns it off -- the same shape reminder_hour already uses.
alter table public.push_subscriptions
  add column if not exists morning_hour integer default 8;

do $$
begin
  alter table public.push_subscriptions
    add constraint push_subscriptions_morning_hour_check
    check (morning_hour is null or morning_hour between 0 and 23);
exception
  when duplicate_object then null;
end $$;

-- The device's own calendar date on the morning it was last greeted. Same job
-- last_remind does for the nightly reminder: the cron ticks hourly, and this
-- is what stops a device inside its morning hour being greeted twice.
alter table public.push_subscriptions
  add column if not exists last_morning date;

-- The hourly sweep reads only rows that want a morning message.
create index if not exists push_subscriptions_morning_idx
  on public.push_subscriptions (morning_hour)
  where enabled and morning_hour is not null;

-- ----------------------------------------------------------------- streak --

-- The same number the home screen shows, computed here instead of on the
-- device, because at 8am the device is asleep and the sender is the only one
-- awake to ask.
--
-- It must agree with computeStats() in src/lib/sessions.ts exactly, or the
-- notification says 12 and the app says 11 an hour later:
--
--   - days are the device's own local_date, never derived from UTC;
--   - an unprayed today does not end a streak, because the day is not over --
--     so the run is anchored at today if it was prayed and yesterday if not;
--   - duplicate prayers in one day count as one day.
--
-- Gaps-and-islands: consecutive dates minus their row number land on the same
-- value, so one group is one unbroken run. Counting the group the anchor falls
-- in is the streak.
create or replace function public.streak_for(uid uuid, today date)
returns integer
language sql
stable
set search_path = ''
as $$
  with days as (
    select distinct s.local_date as d
      from public.prayer_sessions s
     where s.user_id = uid
       and s.local_date <= today
       -- Matches KEEP_DAYS on the device. A run older than this cannot reach
       -- today anyway, and the bound keeps the scan off a long history.
       and s.local_date > today - 400
  ),
  anchor as (
    select max(d) as a from days where d >= today - 1
  ),
  runs as (
    select d, d - (row_number() over (order by d))::int as g from days
  )
  select coalesce((
    select count(*)::int
      from runs, anchor
     where anchor.a is not null
       and runs.d <= anchor.a
       and runs.g = (select r.g from runs r where r.d = anchor.a)
  ), 0);
$$;

-- ------------------------------------------------------ morning selection --

-- The devices whose local clock has just reached their morning hour and which
-- have not been greeted yet on their own local date, each with the streak the
-- message should speak to.
--
-- user_id is null for a device that subscribed without signing in. There is no
-- account to count sessions against, so its streak is 0 and last_prayed is
-- null -- which the copy reads as "has not started", and it is the truth as far
-- as anything here can know. Signing in later makes the streak real.
create or replace function public.due_morning_messages()
returns table (
  id          uuid,
  endpoint    text,
  p256dh      text,
  auth        text,
  tz          text,
  user_id     uuid,
  streak      integer,
  last_prayed date
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
    case
      when s.user_id is null then 0
      else public.streak_for(
             s.user_id,
             (now() at time zone public.safe_tz(s.tz))::date
           )
    end as streak,
    case
      when s.user_id is null then null
      else (
        select max(p.local_date)
          from public.prayer_sessions p
         where p.user_id = s.user_id
      )
    end as last_prayed
  from public.push_subscriptions s
  where s.enabled
    and s.morning_hour is not null
    and extract(hour from (now() at time zone public.safe_tz(s.tz))) = s.morning_hour
    and (
      s.last_morning is null
      or s.last_morning < (now() at time zone public.safe_tz(s.tz))::date
    );
$$;

-- Secret key only, for the same reason due_daily_reminders is: the rows carry
-- every subscriber's endpoint, and now their prayer history alongside it.
revoke all on function public.due_morning_messages() from public, anon, authenticated;
revoke all on function public.streak_for(uuid, date) from public, anon, authenticated;

-- ------------------------------------------------------------ kill switch --

-- Not the copy -- that is in the app, because it is a few dozen strings chosen
-- per device rather than one message anyone would edit in a textarea. This is
-- the switch and the destination: somewhere to turn a daily push to every
-- subscriber off without a deploy.
insert into public.app_settings (key, value)
values ('morning_message', jsonb_build_object('enabled', true, 'url', '/'))
on conflict (key) do nothing;
