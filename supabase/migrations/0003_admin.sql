-- Unified Prayers -- the admin role, and the two things it publishes.
--
-- Everything before this migration was per-user: a row belonged to an account
-- and only that account could read it. This one introduces the opposite shape
-- -- rows written by one person and read by everyone -- so the policies run the
-- other way round: public SELECT, admin-only INSERT/UPDATE/DELETE.
--
-- The single rule the whole file rests on: an admin is a row in app_admins, and
-- nothing reachable from the browser can create one. There is no "make me an
-- admin" path, no self-serve upgrade, no flag on a table the account owns. The
-- only way in is the SQL editor or the secret key (npm run grant:admin).

-- ------------------------------------------------------------- app_admins --

-- Deliberately its own table rather than a boolean on `profiles`. Profiles are
-- updatable by their owner -- that is what lets someone change their display
-- name -- so an `is_admin` column there would be one forgotten WITH CHECK away
-- from letting any account promote itself. A separate table with no write
-- policy at all cannot be written from the browser under any policy mistake.
create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  -- Free text for "who is this and why" -- useful a year from now when the
  -- list has three rows and nobody remembers granting the second one.
  note       text,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;

-- Read your own row and nobody else's. The app needs exactly this much: it asks
-- "am I an admin" to decide whether to render the admin tab. Who else is an
-- admin is not the browser's business, and a readable list of privileged
-- accounts is a target list.
drop policy if exists "admins: read own row" on public.app_admins;
create policy "admins: read own row" on public.app_admins
  for select to authenticated using (auth.uid() = user_id);

-- No insert, update or delete policy. RLS denies by default, so grants happen
-- only from the SQL editor or with the secret key.

-- ---------------------------------------------------------------- is_admin --

-- SECURITY DEFINER so it can see app_admins rows the caller's own policy would
-- hide, which is what lets it be used inside other tables' policies without
-- every admin needing to read the whole admin list.
--
-- It is also what avoids the recursion trap: a policy on app_admins that itself
-- queried app_admins would loop. This function is outside RLS, so it does not.
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select uid is not null
     and exists (select 1 from public.app_admins a where a.user_id = uid);
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;

-- --------------------------------------------- content_documents: writing --

-- 0001 granted writes to nobody, so correcting the prayer text meant opening
-- the SQL editor. Admins can now do it from the app. The public read policy
-- from 0001 is unchanged.
drop policy if exists "content: admin insert" on public.content_documents;
drop policy if exists "content: admin update" on public.content_documents;

create policy "content: admin insert" on public.content_documents
  for insert to authenticated with check (public.is_admin());
create policy "content: admin update" on public.content_documents
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Still no delete policy: the three keys are fixed by a CHECK constraint, and
-- deleting one would drop the app back to the bundled text with no trace of why.

-- ------------------------------------------------------------------ verses --

-- The verse shown on the Today tab. Until now it was one string inside the
-- design document, which meant changing it rewrote a 400-line JSON blob and
-- there was no way to line up a week in advance. A table of them can be
-- scheduled and edited one at a time.
--
-- Two ways to reach the screen, and they compose:
--   show_on = a date   pinned to that day, wherever it sits in the list
--   show_on = null     part of the rotation pool, picked by day number
-- A pinned verse always wins. With none pinned and none in the pool, the app
-- falls back to the verse in the bundled design document, so an empty table --
-- or no network at all -- still shows something.
create table if not exists public.verses (
  id         uuid primary key default gen_random_uuid(),
  text_ar    text not null check (length(trim(text_ar)) between 1 and 2000),
  text_en    text not null check (length(trim(text_en)) between 1 and 2000),
  ref_ar     text check (ref_ar is null or length(ref_ar) <= 120),
  ref_en     text check (ref_en is null or length(ref_en) <= 120),
  -- A calendar date, not a timestamp: "the verse for the 9th" means the 9th in
  -- the reader's own timezone, and the client is the only thing that knows it.
  show_on    date,
  active     boolean not null default true,
  -- Fixes the rotation order. Rows sharing a position fall back to created_at,
  -- so the pool has one stable order regardless of when rows were edited.
  sort       integer not null default 0,
  -- Defaulted rather than sent by the client: a client could send anyone's
  -- id, and a column recording who published something is worth nothing if
  -- the publisher picks what it says. auth.uid() is the session, not a
  -- parameter, so it is the one value the browser cannot choose.
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The client asks for the pinned row for today and the pool in one round trip;
-- both halves of that query are covered here.
create index if not exists verses_show_on_idx on public.verses (show_on)
  where active and show_on is not null;
create index if not exists verses_pool_idx on public.verses (sort, created_at)
  where active and show_on is null;

alter table public.verses enable row level security;

drop trigger if exists verses_touch on public.verses;
create trigger verses_touch
  before update on public.verses
  for each row execute function public.touch_updated_at();

drop policy if exists "verses: public read active" on public.verses;
drop policy if exists "verses: admin read all"     on public.verses;
drop policy if exists "verses: admin write"        on public.verses;

-- Anonymous visitors included: the app is fully usable signed out, and the
-- verse is part of the prayer surface, not the account.
create policy "verses: public read active" on public.verses
  for select to anon, authenticated using (active);

-- Admins additionally see the ones switched off, which is what makes the
-- editor's "inactive" list possible.
create policy "verses: admin read all" on public.verses
  for select to authenticated using (public.is_admin());

create policy "verses: admin write" on public.verses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------- announcements --

-- Messages the app shows on top of itself: a banner strip on the Prayers tab,
-- or a modal on open. Same row shape for both -- `kind` is the only difference,
-- and it is a column so a message can be softened from modal to banner without
-- being retyped.
--
-- This is also the table a promotional interstitial would live in. That is the
-- reason for cta_url and image_url, and the reason `dismissible` exists as a
-- column rather than being assumed: an announcement that cannot be dismissed is
-- occasionally right (a service notice) and usually wrong (everything else).
create table if not exists public.announcements (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null default 'banner' check (kind in ('banner', 'modal')),

  -- Both languages are required. A message that exists in only one is worse
  -- than no message: the reader who does not have that language sees a blank
  -- card and cannot tell whether the app is broken.
  title_ar     text not null check (length(trim(title_ar)) between 1 and 120),
  title_en     text not null check (length(trim(title_en)) between 1 and 120),
  body_ar      text check (body_ar is null or length(body_ar) <= 1000),
  body_en      text check (body_en is null or length(body_en) <= 1000),

  -- The action, if there is one. Label and URL travel together: a URL with no
  -- label has nothing to render, a label with no URL is a button that does
  -- nothing. https only -- this string becomes an href in the app.
  cta_label_ar text check (cta_label_ar is null or length(cta_label_ar) <= 40),
  cta_label_en text check (cta_label_en is null or length(cta_label_en) <= 40),
  cta_url      text check (cta_url is null or cta_url ~ '^https://'),
  image_url    text check (image_url is null or image_url ~ '^https://'),

  dismissible  boolean not null default true,
  -- Highest wins when several are live at once. Only one banner and one modal
  -- are ever on screen; this decides which.
  priority     integer not null default 0,

  audience     text not null default 'all'
    check (audience in ('all', 'signed_in', 'signed_out')),

  starts_at    timestamptz,
  ends_at      timestamptz,
  -- The manual switch, independent of the window. Turning a message off has to
  -- be one click, not "edit ends_at to a time in the past".
  active       boolean not null default true,

  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint announcements_window check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint announcements_cta check (
    (cta_url is null) or (cta_label_ar is not null and cta_label_en is not null)
  )
);

create index if not exists announcements_live_idx
  on public.announcements (priority desc, created_at desc)
  where active;

alter table public.announcements enable row level security;

drop trigger if exists announcements_touch on public.announcements;
create trigger announcements_touch
  before update on public.announcements
  for each row execute function public.touch_updated_at();

drop policy if exists "announcements: public read live" on public.announcements;
drop policy if exists "announcements: admin read all"   on public.announcements;
drop policy if exists "announcements: admin write"      on public.announcements;

-- The time window is enforced here rather than only in the client, so a
-- message scheduled for next week is not sitting in the browser a week early
-- waiting for a date check somebody could skip.
create policy "announcements: public read live" on public.announcements
  for select to anon, authenticated using (
    active
    and (starts_at is null or starts_at <= now())
    and (ends_at   is null or ends_at   >  now())
  );

create policy "announcements: admin read all" on public.announcements
  for select to authenticated using (public.is_admin());

create policy "announcements: admin write" on public.announcements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------ app_settings --

-- A small key/value table for things that are configuration rather than
-- content: the copy used by the nightly reminder, and whatever the next one
-- turns out to be. Deliberately not a column-per-setting table -- adding a
-- setting should not need a migration and a redeploy of the type definitions.
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop trigger if exists app_settings_touch on public.app_settings;
create trigger app_settings_touch
  before update on public.app_settings
  for each row execute function public.touch_updated_at();

drop policy if exists "settings: public read"  on public.app_settings;
drop policy if exists "settings: admin write"  on public.app_settings;

create policy "settings: public read" on public.app_settings
  for select to anon, authenticated using (true);
create policy "settings: admin write" on public.app_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- The nightly reminder's text. Seeded here so the cron has something to send
-- the first time it runs, before anyone has opened the admin tab.
insert into public.app_settings (key, value)
values (
  'daily_reminder',
  jsonb_build_object(
    'title_ar', 'وقت الصلاة',
    'title_en', 'Time to pray',
    'body_ar',  'خذ لحظة مع الروح القدس.',
    'body_en',  'Take a moment with the Holy Spirit.',
    'url',      '/'
  )
)
on conflict (key) do nothing;
