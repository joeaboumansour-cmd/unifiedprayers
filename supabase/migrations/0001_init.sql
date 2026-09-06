-- Unified Prayers — initial schema.
--
-- Three concerns, three tables:
--   user_prefs        the Settings tab, per account
--   user_progress     where you left off, per account
--   content_documents the prayer text, editable without a redeploy
--
-- Everything the app writes is per-user and guarded by RLS. The anon key is
-- public, so RLS is the only thing standing between one account and another's
-- rows -- every table below enables it, and none of them are left open.

-- ---------------------------------------------------------------- helpers --

-- Keeps updated_at honest without trusting the client to send it.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------- user_prefs --

create table if not exists public.user_prefs (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  -- Mirrors the Prefs type in src/app/page.tsx. Checks are duplicated from the
  -- TypeScript unions on purpose: the anon key lets anyone shape a request, so
  -- the database has to be the one that says what a valid palette is.
  lang        text    not null default 'ar'      check (lang in ('ar', 'en')),
  bead_style  text    not null default 'arc'     check (bead_style in ('arc', 'ring', 'chain', 'orb')),
  palette     text    not null default 'midnight'
    check (palette in ('midnight', 'rose', 'lavender', 'salmon', 'sand', 'sage')),
  size        real    not null default 1         check (size > 0 and size <= 3),
  dim         boolean not null default false,
  haptics     boolean not null default true,
  audio       boolean not null default false,
  awake       boolean not null default true,
  updated_at  timestamptz not null default now()
);

alter table public.user_prefs enable row level security;

drop trigger if exists user_prefs_touch on public.user_prefs;
create trigger user_prefs_touch
  before update on public.user_prefs
  for each row execute function public.touch_updated_at();

drop policy if exists "own prefs: read"   on public.user_prefs;
drop policy if exists "own prefs: insert" on public.user_prefs;
drop policy if exists "own prefs: update" on public.user_prefs;
drop policy if exists "own prefs: delete" on public.user_prefs;

create policy "own prefs: read"   on public.user_prefs
  for select using (auth.uid() = user_id);
create policy "own prefs: insert" on public.user_prefs
  for insert with check (auth.uid() = user_id);
create policy "own prefs: update" on public.user_prefs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own prefs: delete" on public.user_prefs
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------- user_progress --

create table if not exists public.user_progress (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  prayer      text not null default 'spirit' check (prayer in ('spirit', 'mary')),
  mystery_set text not null default 'joyful'
    check (mystery_set in ('joyful', 'sorrowful', 'glorious', 'luminous')),
  spirit_step integer not null default 0 check (spirit_step >= 0),
  mary_step   integer not null default 0 check (mary_step >= 0),
  -- When the snapshot was taken on the device. The 24h resume window is
  -- measured against this, so it is the client's clock, not the server's.
  at          timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.user_progress enable row level security;

drop trigger if exists user_progress_touch on public.user_progress;
create trigger user_progress_touch
  before update on public.user_progress
  for each row execute function public.touch_updated_at();

drop policy if exists "own progress: read"   on public.user_progress;
drop policy if exists "own progress: insert" on public.user_progress;
drop policy if exists "own progress: update" on public.user_progress;
drop policy if exists "own progress: delete" on public.user_progress;

create policy "own progress: read"   on public.user_progress
  for select using (auth.uid() = user_id);
create policy "own progress: insert" on public.user_progress
  for insert with check (auth.uid() = user_id);
create policy "own progress: update" on public.user_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own progress: delete" on public.user_progress
  for delete using (auth.uid() = user_id);

-- ------------------------------------------------------ content_documents --

-- One row per bundled JSON file, holding that file's document verbatim. The
-- content is deeply nested, bilingual and order-sensitive (ordered arrays of
-- sections, mysteries, UI strings); shredding it into relational columns would
-- mean rebuilding it on every read and rewriting the types in src/lib/content.ts
-- for no gain. A document per file keeps those types exactly as they are, so
-- the DB copy and the bundled fallback are the same shape.
create table if not exists public.content_documents (
  key        text primary key check (key in ('design', 'prayers', 'teachings')),
  doc        jsonb not null,
  -- Bumped by hand when the shape changes, so an old client can refuse a
  -- document it would not understand rather than crash on it.
  version    integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.content_documents enable row level security;

drop trigger if exists content_documents_touch on public.content_documents;
create trigger content_documents_touch
  before update on public.content_documents
  for each row execute function public.touch_updated_at();

-- The prayer text is public: it is already in the JS bundle every visitor
-- downloads. Reads are open to anon; writes are not granted to anyone here, so
-- they are possible only from the SQL editor or with the service_role key.
drop policy if exists "content: public read" on public.content_documents;
create policy "content: public read" on public.content_documents
  for select to anon, authenticated using (true);
