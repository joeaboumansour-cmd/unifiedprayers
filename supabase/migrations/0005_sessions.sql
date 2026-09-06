-- Unified Prayers — the record behind the home-screen stats.
--
-- user_progress says where you are; this says what you have finished. One row
-- per completed prayer, so a streak, a month's count and a month's minutes are
-- counted rather than guessed.
--
-- The device is the author here. It makes the id, it stamps the time, and it
-- decides which calendar day the prayer belongs to -- a streak is counted in
-- the days the person lived through, and deriving that from UTC on the server
-- would move late-evening prayers into tomorrow for anyone east of London.

create table if not exists public.prayer_sessions (
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Generated on the device before the row exists. It is the primary key with
  -- user_id, which is what makes uploading a local log idempotent: a phone
  -- that syncs the same finished prayer twice writes the same row twice.
  client_id   text not null check (char_length(client_id) between 8 and 64),
  prayer      text not null check (prayer in ('spirit', 'mary')),
  -- Null for the Holy Spirit chaplet, which has no mystery set.
  mystery_set text
    check (mystery_set is null or mystery_set in ('joyful', 'sorrowful', 'glorious', 'luminous')),
  finished_at timestamptz not null default now(),
  -- The device's own calendar day, YYYY-MM-DD. Streaks are read off this.
  local_date  date not null,
  -- Clamped on the device too; repeated here because the anon key means any
  -- number at all can be sent, and a month of minutes has to stay believable.
  seconds     integer not null default 0 check (seconds >= 0 and seconds <= 10800),
  created_at  timestamptz not null default now(),
  primary key (user_id, client_id)
);

-- Every read is "this account, newest first" or "this account, this month".
create index if not exists prayer_sessions_user_date_idx
  on public.prayer_sessions (user_id, local_date desc);

alter table public.prayer_sessions enable row level security;

drop policy if exists "own sessions: read"   on public.prayer_sessions;
drop policy if exists "own sessions: insert" on public.prayer_sessions;
drop policy if exists "own sessions: delete" on public.prayer_sessions;

create policy "own sessions: read"   on public.prayer_sessions
  for select using (auth.uid() = user_id);
create policy "own sessions: insert" on public.prayer_sessions
  for insert with check (auth.uid() = user_id);
-- Deliberately no update policy. A finished prayer is a fact, not a setting;
-- nothing in the app edits one, so nothing is allowed to.
create policy "own sessions: delete" on public.prayer_sessions
  for delete using (auth.uid() = user_id);
