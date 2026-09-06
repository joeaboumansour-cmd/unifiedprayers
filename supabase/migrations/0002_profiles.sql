-- Unified Prayers -- accounts: profiles, private contact details, usernames.
--
-- Two tables on purpose. Everything in `profiles` is visible to every signed-in
-- user, because a social feature (finding a friend, showing who sent a novena
-- reminder) needs to read it. Everything a person would not want shown to
-- strangers lives in `user_private`, readable only by its owner. Splitting them
-- this way means a future "search for a friend" query cannot leak a phone
-- number by accident -- the permission boundary is the table, not the SELECT
-- list of whichever query someone writes later.

-- ------------------------------------------------------------- usernames --

-- Usernames are stored lowercase and compared exactly. Case-insensitive
-- uniqueness is not a nicety here: allowing both `joseph` and `Joseph` is an
-- impersonation vector the moment profiles are visible to other people.
-- Presentation casing belongs in display_name, which has no uniqueness at all.
--
-- IMMUTABLE so a CHECK constraint can call it. Keep in step with the same
-- rules mirrored for the UI in src/lib/username.ts.
create or replace function public.username_is_valid(u text)
returns boolean
language sql
immutable
as $$
  select u is not null
     -- 3-20 chars, a-z 0-9 and underscore, starting and ending alphanumeric.
     and u ~ '^[a-z0-9][a-z0-9_]{1,18}[a-z0-9]$'
     -- No runs of underscores: `jo__seph` and `jo_seph` are too easy to confuse.
     and u !~ '__'
     -- Names that imply the app is speaking, or that collide with a route.
     and u not in (
       'admin', 'administrator', 'root', 'support', 'help', 'system', 'staff',
       'official', 'moderator', 'mod', 'api', 'auth', 'login', 'signup',
       'signin', 'logout', 'settings', 'account', 'profile', 'password',
       'reset', 'about', 'me', 'you', 'null', 'undefined', 'anonymous',
       'unifiedprayers', 'prayers', 'rosary'
     );
$$;

-- -------------------------------------------------------------- profiles --

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null unique check (public.username_is_valid(username)),
  -- Free text, shown as-is. Length capped so it cannot be used as a bio field
  -- or to push layout around in a list of names.
  display_name text check (display_name is null or length(display_name) between 1 and 40),
  avatar_url   text check (avatar_url is null or avatar_url ~ '^https://'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop policy if exists "profiles: readable by signed-in users" on public.profiles;
drop policy if exists "profiles: insert own"                  on public.profiles;
drop policy if exists "profiles: update own"                  on public.profiles;

-- Signed-in users only. Anonymous visitors get nothing: the app is fully usable
-- without an account, so nothing on the prayer side needs to read this, and a
-- public profile list is a scraping target for no benefit.
create policy "profiles: readable by signed-in users" on public.profiles
  for select to authenticated using (true);

-- Normally the signup trigger below writes this row. The policy exists so a
-- client can repair its own missing profile, and for nothing else.
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

create policy "profiles: update own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- No delete policy: profiles go when the account does, by cascade.

-- ---------------------------------------------------------- user_private --

create table if not exists public.user_private (
  id         uuid primary key references auth.users (id) on delete cascade,
  -- Optional, and E.164 so it is storable in one canonical form. Not put in
  -- auth.users.phone: that column drives SMS OTP sign-in, and writing to it
  -- would entangle an optional contact detail with how people log in.
  phone      text unique check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_private enable row level security;

drop trigger if exists user_private_touch on public.user_private;
create trigger user_private_touch
  before update on public.user_private
  for each row execute function public.touch_updated_at();

drop policy if exists "private: read own"   on public.user_private;
drop policy if exists "private: insert own" on public.user_private;
drop policy if exists "private: update own" on public.user_private;
drop policy if exists "private: delete own" on public.user_private;

create policy "private: read own"   on public.user_private
  for select to authenticated using (auth.uid() = id);
create policy "private: insert own" on public.user_private
  for insert to authenticated with check (auth.uid() = id);
create policy "private: update own" on public.user_private
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "private: delete own" on public.user_private
  for delete to authenticated using (auth.uid() = id);

-- ----------------------------------------------------- signup: build rows --

-- Creates both rows in the same transaction as the auth.users insert, so a
-- taken username fails the whole signup instead of leaving an account with no
-- profile. The uniqueness race between two people submitting the same username
-- at the same moment is settled here by the unique index, not by the
-- availability check the UI runs first -- that check is a courtesy, never the
-- guarantee.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    lower(trim(new.raw_user_meta_data ->> 'username')),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  );

  insert into public.user_private (id, phone)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '')
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------ username availability --

-- Lets the signup form say "that one is taken" before asking for a password.
--
-- SECURITY DEFINER because anonymous visitors cannot read profiles, and should
-- not be able to -- this returns one boolean and never a row. It does let
-- someone test whether a username exists, which is unavoidable for any service
-- with public usernames and is why Supabase's endpoint rate limits matter.
create or replace function public.username_available(u text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.username_is_valid(lower(trim(u)))
     and not exists (
       select 1 from public.profiles where username = lower(trim(u))
     );
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
