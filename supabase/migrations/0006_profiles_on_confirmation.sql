-- Unified Prayers -- build the account rows at confirmation, not at signup.
--
-- Until now on_auth_user_created fired `after insert on auth.users`, so a
-- profile and a user_private row existed the moment somebody submitted the
-- signup form, confirmed or not. With email confirmation switched on that
-- means an unopened link leaves real rows -- a username, a phone number --
-- belonging to an address nobody has proved they own.
--
-- The rows are now written when the address is confirmed instead.
--
-- WHAT THIS COSTS. The old trigger settled a username race inside the signup
-- transaction: two people submitting `joseph` at the same moment, and the
-- second one's signup failed outright. Nothing holds a username between
-- signing up and confirming any more, so the loser of that race is now
-- discovered at confirmation time, when there is no form left to show an error
-- on. Refusing the confirmation would be the worst of both worlds: the address
-- is spoken for by a row they cannot confirm, and they cannot sign up again
-- with it either. So a clash takes a numeric suffix instead -- `joseph2` --
-- which is visible to them and costs them nothing they cannot live with. It is
-- rare by construction: it needs two signups of the same name inside one
-- confirmation window.
--
-- public.username_available() is unchanged and still reads profiles, so it now
-- answers "no confirmed account holds this", not "nobody is mid-signup with
-- it". That is the same courtesy-not-guarantee it always was, with a wider
-- window.

-- ------------------------------------------------- build the account rows --

create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted text;
  taken  text;
  n      int := 1;
  ph     text;
begin
  -- Belt and braces: both triggers below already filter on this.
  if new.email_confirmed_at is null then
    return new;
  end if;

  -- Idempotent. An email change confirms an address on an account that has had
  -- a profile for months, and that must not try to build a second one.
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  wanted := lower(trim(new.raw_user_meta_data ->> 'username'));

  -- Signup validates this in the form and again in username.ts, so an invalid
  -- name here means the row came from somewhere else -- a dashboard invite, an
  -- OAuth provider, a hand-written insert. Confirmation must still succeed.
  if wanted is null or not public.username_is_valid(wanted) then
    wanted := 'pilgrim';
  end if;

  -- Room for the suffix, without breaking the 20-char ceiling or the rule that
  -- a username ends alphanumeric. Digits satisfy both.
  taken := wanted;
  while exists (select 1 from public.profiles where username = taken) loop
    n := n + 1;
    taken := left(wanted, 20 - length(n::text)) || n::text;
  end loop;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    taken,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  );

  ph := nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '');

  -- Phone is unique and optional, and unlike a username it cannot be given a
  -- suffix -- a phone number with a digit appended is somebody else's phone
  -- number. If it has been claimed in the meantime it is dropped, and the
  -- account is confirmed without one. Losing an optional contact detail is a
  -- far smaller harm than refusing to let someone into the account.
  if ph is not null and exists (
    select 1 from public.user_private where phone = ph
  ) then
    ph := null;
  end if;

  insert into public.user_private (id, phone) values (new.id, ph);

  return new;
end;
$$;

-- ----------------------------------------------------------- the triggers --

drop trigger if exists on_auth_user_created   on auth.users;
drop trigger if exists on_auth_user_confirmed on auth.users;

-- Accounts that arrive already confirmed: an admin creating one by hand, an
-- invite, or the project with email confirmation switched back off. Without
-- this they would never get a profile at all, because no UPDATE follows.
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  when (new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();

-- The ordinary path: the link in the email is opened.
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();

-- Superseded by handle_user_confirmed above.
drop function if exists public.handle_new_user();

-- ------------------------------------------------------------- backfill --

-- Any account confirmed before this migration ran that never got its rows --
-- there should be none, but a missing profile is invisible until somebody
-- signs in and finds the app half working, so it is worth being sure.
insert into public.profiles (id, username, display_name)
select
  u.id,
  left(coalesce(
    nullif(lower(trim(u.raw_user_meta_data ->> 'username')), ''),
    'pilgrim'
  ), 20),
  nullif(trim(coalesce(u.raw_user_meta_data ->> 'display_name', '')), '')
from auth.users u
where u.email_confirmed_at is not null
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and public.username_is_valid(lower(trim(u.raw_user_meta_data ->> 'username')))
  and not exists (
    select 1 from public.profiles p
    where p.username = lower(trim(u.raw_user_meta_data ->> 'username'))
  );

insert into public.user_private (id, phone)
select u.id, null
from auth.users u
where u.email_confirmed_at is not null
  and exists     (select 1 from public.profiles     p where p.id = u.id)
  and not exists (select 1 from public.user_private v where v.id = u.id);
