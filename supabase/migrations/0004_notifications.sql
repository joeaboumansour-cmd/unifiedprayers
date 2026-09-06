-- Unified Prayers -- Web Push: the devices that subscribed, and what is sent.
--
-- One thing sets these two tables apart from everything else in the schema:
-- they are not written from the browser at all. Every insert, update and delete
-- goes through a route handler under /api/push using the secret key.
--
-- That is not caution for its own sake. A push subscription is identified by
-- its endpoint URL, and a device that is signed out has no auth.uid() to prove
-- ownership with -- so an RLS policy would have to trust "I am the device that
-- owns this endpoint", which is the same as no policy at all. Doing the writes
-- server-side means the endpoint never has to double as a credential, and it is
-- also where the VAPID private key already has to live to send anything.
--
-- So: RLS is on, and there are no policies. Everything is denied to anon and
-- authenticated alike; the secret key bypasses it. That is the whole design.

-- ------------------------------------------------------- push_subscriptions --

create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),

  -- Null for a device that subscribed without signing in. Notifications still
  -- reach it -- praying does not require an account, so neither should a
  -- reminder -- it just cannot be targeted by username.
  user_id       uuid references auth.users (id) on delete cascade,

  -- The push service's URL for this device. Unique because it *is* the device
  -- as far as the push service is concerned: re-subscribing on the same browser
  -- returns the same endpoint, so upserting on it is what stops one phone from
  -- accumulating a row per visit.
  endpoint      text not null unique,
  -- The keys the payload is encrypted to. Without them a message can only be
  -- delivered empty, which iOS shows as a generic "site updated" notification.
  p256dh        text not null,
  auth          text not null,

  -- Rough provenance, for the admin list. Not used for anything but showing
  -- "iPhone, added 3 days ago" next to a subscriber count.
  user_agent    text,
  platform      text,

  -- The nightly reminder. Both halves are needed for it to mean anything: the
  -- hour is local, and only the device knows which local that is. IANA name,
  -- validated in the route handler before it gets here.
  tz            text not null default 'UTC',
  reminder_hour integer check (reminder_hour is null or reminder_hour between 0 and 23),
  -- The reminder's own calendar date in the device's timezone. The cron runs
  -- every hour and this is what stops it sending the same reminder twice when
  -- a device is seen more than once inside its reminder hour.
  last_remind   date,

  enabled       boolean not null default true,
  -- Consecutive send failures. A push service answering 404/410 means the
  -- subscription is gone for good and the row is deleted outright; this counts
  -- the softer failures, so a permanently broken endpoint can be retired.
  failures      integer not null default 0,

  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- The two ways the sender selects rows: everyone, and one account's devices.
create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id) where user_id is not null;
-- The hourly reminder sweep reads only rows that asked for one.
create index if not exists push_subscriptions_reminder_idx
  on public.push_subscriptions (reminder_hour)
  where enabled and reminder_hour is not null;

alter table public.push_subscriptions enable row level security;
-- Intentionally no policies. See the header.

drop trigger if exists push_subscriptions_touch on public.push_subscriptions;
create trigger push_subscriptions_touch
  before update on public.push_subscriptions
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------ notifications --

-- The outbox and the log in one table. A row is written before anything is
-- sent and updated once the sending finishes, so a crash midway leaves a row
-- stuck in 'sending' rather than a message nobody can account for.
create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),

  title_ar        text not null check (length(trim(title_ar)) between 1 and 120),
  title_en        text not null check (length(trim(title_en)) between 1 and 120),
  body_ar         text check (body_ar is null or length(body_ar) <= 500),
  body_en         text check (body_en is null or length(body_en) <= 500),
  -- Where tapping it goes. A path within the app, or an https URL.
  url             text not null default '/'
    check (url ~ '^(/|https://)'),

  audience        text not null default 'all' check (audience in ('all', 'user')),
  target_user_id  uuid references auth.users (id) on delete cascade,

  -- Null means "send it now". A timestamp means the cron picks it up once the
  -- clock passes it -- absolute, not per-timezone: a one-off announcement goes
  -- out at a moment, unlike the nightly reminder which is local to each device.
  scheduled_at    timestamptz,

  status          text not null default 'draft'
    check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed', 'canceled')),
  sent_at         timestamptz,
  sent_count      integer not null default 0,
  failed_count    integer not null default 0,
  error           text,

  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- A targeted send with nobody to send it to is a mistake worth catching here
  -- rather than discovering as a delivery count of zero.
  constraint notifications_target check (
    (audience = 'all'  and target_user_id is null) or
    (audience = 'user' and target_user_id is not null)
  )
);

-- The cron's only query: what is due.
create index if not exists notifications_due_idx
  on public.notifications (scheduled_at)
  where status = 'scheduled';
create index if not exists notifications_recent_idx
  on public.notifications (created_at desc);

alter table public.notifications enable row level security;

drop trigger if exists notifications_touch on public.notifications;
create trigger notifications_touch
  before update on public.notifications
  for each row execute function public.touch_updated_at();

-- Admins read the history in the admin tab. Writes still go through the route
-- handler -- it is the only thing that can actually deliver a message, and a
-- row inserted around it would sit at 'draft' forever.
drop policy if exists "notifications: admin read" on public.notifications;
create policy "notifications: admin read" on public.notifications
  for select to authenticated using (public.is_admin());

-- Cancelling a scheduled message is the one write worth allowing from the app:
-- it is the urgent one, and it removes rather than creates a delivery.
drop policy if exists "notifications: admin cancel" on public.notifications;
create policy "notifications: admin cancel" on public.notifications
  for update to authenticated
  using (public.is_admin() and status = 'scheduled')
  with check (public.is_admin() and status in ('scheduled', 'canceled'));

-- ------------------------------------------------------- reminder selection --

-- Postgres raises on an unrecognised timezone name, and one bad row would take
-- down the whole nightly sweep. The route handler validates before storing;
-- this is the second line, so a row that predates that check degrades to UTC.
create or replace function public.safe_tz(name text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select n.name from pg_catalog.pg_timezone_names n where n.name = safe_tz.name),
    'UTC'
  );
$$;

-- The devices whose local clock has just reached their reminder hour and which
-- have not already been reminded on their own local date.
--
-- The date comparison is what makes the hourly cron idempotent: run it five
-- times inside the same hour and only the first run sends. Marking last_remind
-- is the caller's job, after a successful send -- doing it here would mark
-- devices whose delivery then failed.
create or replace function public.due_daily_reminders()
returns setof public.push_subscriptions
language sql
security definer
stable
set search_path = ''
as $$
  select s.*
    from public.push_subscriptions s
   where s.enabled
     and s.reminder_hour is not null
     and extract(hour from (now() at time zone public.safe_tz(s.tz))) = s.reminder_hour
     and (
       s.last_remind is null
       or s.last_remind < (now() at time zone public.safe_tz(s.tz))::date
     );
$$;

-- Callable by the secret key only. The cron route is the sole caller, and the
-- rows include every subscriber's endpoint -- nothing in the browser should be
-- able to ask for that list.
revoke all on function public.due_daily_reminders() from public, anon, authenticated;
