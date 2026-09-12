-- Unified Prayers -- one-off: rename the account `joeaboumansour` to `joe`.
--
-- A data migration, not a schema one. `joe` passes username_is_valid (three
-- characters is the floor, and it is not on the reserved list), and nothing
-- else in the schema stores a username -- every other table points at
-- profiles.id -- so there is no second copy to keep in step.
--
-- Written to be safe to run twice and safe to run against a database where
-- this account does not exist: the update matches on the old name, so a second
-- run simply touches no rows. The one case that must not pass silently is `joe`
-- already belonging to somebody else, which the unique index would reject
-- anyway; this raises a sentence a human can read instead.

do $$
declare
  renamed int;
begin
  if exists (
    select 1 from public.profiles
     where username = 'joe'
       and id <> '9538f878-2c9c-4731-8a1c-5927543a8583'::uuid
  ) then
    raise exception 'username joe is already taken by another account';
  end if;

  update public.profiles
     set username = 'joe'
   where id = '9538f878-2c9c-4731-8a1c-5927543a8583'::uuid
     and username = 'joeaboumansour';

  get diagnostics renamed = row_count;

  if renamed = 0 then
    raise notice 'nothing renamed: joeaboumansour not found (already joe, or a different database)';
  end if;
end;
$$;
