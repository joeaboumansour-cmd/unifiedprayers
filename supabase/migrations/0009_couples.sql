-- Unified Prayers -- couples, and the devotion only a couple can read.
--
-- The second devotional book is written for two people praying together, so
-- its pages are locked until two accounts have said they are those two people.
-- That lock is a policy, not a disabled button: `daily_devotions` is read
-- straight from PostgREST with the anon key, so a client-side check would be a
-- suggestion. The last statement in this file is the real lock.
--
-- Pairing is by invitation and it is symmetric. One person asks for a code,
-- the other types it in, and from that moment neither is the owner of the
-- link -- either can dissolve it, and dissolving it unlinks both. There is no
-- "remove my partner" that leaves the remover paired.

-- ---------------------------------------------------------------- couples --

create table if not exists public.couples (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- `user_id` is the primary key, not a composite with couple_id, and that is
-- the whole of "one couple per person": a second membership row for the same
-- account cannot be inserted at all, under any bug in the functions below.
create table if not exists public.couple_members (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  couple_id uuid not null references public.couples (id) on delete cascade,
  joined_at timestamptz not null default now()
);

create index if not exists couple_members_couple_idx
  on public.couple_members (couple_id);

-- Two, and no more. Enforced as a constraint trigger rather than in the accept
-- function so it holds even if a later migration adds another way in.
create or replace function public.couple_members_max_two()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.couple_members m
       where m.couple_id = new.couple_id) > 2 then
    raise exception 'a couple has two people';
  end if;
  return null;
end;
$$;

drop trigger if exists couple_members_max_two on public.couple_members;
create constraint trigger couple_members_max_two
  after insert on public.couple_members
  deferrable initially immediate
  for each row execute function public.couple_members_max_two();

-- ---------------------------------------------------------------- helpers --

-- SECURITY DEFINER so these can be used inside policies without every reader
-- needing to be able to read the membership table itself. Both answer only
-- about the account that called them.
create or replace function public.couple_id_for(uid uuid default auth.uid())
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select m.couple_id from public.couple_members m where m.user_id = uid;
$$;

-- "Paired with someone", not "has a membership row". A couple whose other half
-- has left is a couple of one, and a couple of one must not unlock a book
-- written for two.
create or replace function public.in_couple(uid uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.couple_members me
      join public.couple_members them
        on them.couple_id = me.couple_id
       and them.user_id <> me.user_id
     where me.user_id = uid
  );
$$;

grant execute on function public.couple_id_for(uuid) to authenticated;
-- anon too: the devotion read policy calls it, and for anon it answers false.
grant execute on function public.in_couple(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- invites --

create table if not exists public.couple_invites (
  -- Typed by a person off another person's screen, so the alphabet excludes
  -- the characters that get misread out loud: O/0, I/1, S/5.
  code        text primary key check (code ~ '^[A-HJ-NP-RT-Z2-46-9]{6}$'),
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- A code left lying in a chat thread should stop working. A week is long
  -- enough for "I will do it tonight" and short enough to matter.
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz
);

-- One live code per person. Asking for a second invalidates the first, which
-- is what the create function below does; this makes that a rule rather than
-- a convention.
create unique index if not exists couple_invites_one_open
  on public.couple_invites (created_by)
  where accepted_at is null;

-- ------------------------------------------------------------------- RPCs --

-- Everything that writes to these tables is a function. The tables themselves
-- have no insert/update/delete policy at all, so the only way in is through
-- the three below, each of which checks what it needs to.

create or replace function public.create_couple_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid      uuid := auth.uid();
  alphabet text := 'ABCDEFGHJKLMNPQRTUVWXYZ23469';
  candidate text;
  i        integer;
  attempt  integer := 0;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  if public.in_couple(uid) then
    raise exception 'already paired' using errcode = '23505';
  end if;

  -- Asking again replaces the old code rather than accumulating them.
  delete from public.couple_invites
   where created_by = uid and accepted_at is null;

  loop
    attempt := attempt + 1;
    candidate := '';
    for i in 1..6 loop
      candidate := candidate
        || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    begin
      insert into public.couple_invites (code, created_by)
      values (candidate, uid);
      return candidate;
    exception when unique_violation then
      -- Collision on a 28^6 space. Retrying is cheaper than reserving.
      if attempt > 12 then
        raise exception 'could not allocate a code';
      end if;
    end;
  end loop;
end;
$$;

create or replace function public.accept_couple_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid    uuid := auth.uid();
  norm   text := upper(regexp_replace(coalesce(invite_code, ''), '[^A-Za-z0-9]', '', 'g'));
  inv    public.couple_invites;
  new_id uuid;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;

  -- Locked, so two people racing on the same code cannot both be accepted.
  select * into inv
    from public.couple_invites
   where code = norm
     and accepted_at is null
     and expires_at > now()
   for update;

  if inv.code is null then
    raise exception 'no such code' using errcode = 'P0002';
  end if;
  if inv.created_by = uid then
    raise exception 'that is your own code' using errcode = 'P0001';
  end if;
  if public.in_couple(uid) or public.in_couple(inv.created_by) then
    raise exception 'already paired' using errcode = '23505';
  end if;

  insert into public.couples default values returning id into new_id;
  insert into public.couple_members (user_id, couple_id)
  values (inv.created_by, new_id), (uid, new_id);

  update public.couple_invites
     set accepted_by = uid, accepted_at = now()
   where code = inv.code;

  return new_id;
end;
$$;

-- Dissolves the whole link, for both people. A couple is two; there is no
-- state where one of them is still paired and the other is not.
create or replace function public.leave_couple()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.couple_id_for(auth.uid());
begin
  if cid is null then
    return;
  end if;
  -- The membership rows cascade from this.
  delete from public.couples where id = cid;
  -- Both are free to pair again, so neither is left holding a dead code.
  delete from public.couple_invites
   where created_by = auth.uid() and accepted_at is null;
end;
$$;

revoke all on function public.create_couple_invite()       from public, anon;
revoke all on function public.accept_couple_invite(text)   from public, anon;
revoke all on function public.leave_couple()               from public, anon;
grant execute on function public.create_couple_invite()     to authenticated;
grant execute on function public.accept_couple_invite(text) to authenticated;
grant execute on function public.leave_couple()             to authenticated;

-- ------------------------------------------------------------------- RLS --

alter table public.couples        enable row level security;
alter table public.couple_members enable row level security;
alter table public.couple_invites enable row level security;

drop policy if exists "couples: read own"         on public.couples;
drop policy if exists "couple members: read own"  on public.couple_members;
drop policy if exists "couple invites: read own"  on public.couple_invites;

create policy "couples: read own" on public.couples
  for select to authenticated using (id = public.couple_id_for());

-- Both rows of your own couple, which is how the app names your partner. Not
-- anybody else's: who is paired with whom is not public.
create policy "couple members: read own" on public.couple_members
  for select to authenticated using (couple_id = public.couple_id_for());

-- Your own codes only, so the screen that shows a code can read it back. A
-- code is a secret shared with one person; being able to list other people's
-- would make the whole mechanism pointless.
create policy "couple invites: read own" on public.couple_invites
  for select to authenticated using (created_by = auth.uid());

-- No write policies anywhere above. The three functions are the only way in.

-- ------------------------------------------------ the lock on the second book --

-- The point of the file. `individual` is unchanged -- public, sealed only by
-- its day. `couples` additionally requires the reader to actually be half of a
-- couple, which for an anonymous visitor is false and stays false.
--
-- The admin read-all policy from 0008 is untouched and still returns every
-- row to an admin, pairing or not. That is deliberate: an admin has to be able
-- to proof-read a page they have just typed. The card on their home screen is
-- locked by the app the same way everyone else's is, so this is a difference
-- in what the database will hand over, not in what the app shows.
drop policy if exists "devotions: public read due" on public.daily_devotions;
create policy "devotions: public read due" on public.daily_devotions
  for select to anon, authenticated
  using (
    active
    and public.devotion_is_due(month, day)
    and (track <> 'couples' or public.in_couple())
  );
