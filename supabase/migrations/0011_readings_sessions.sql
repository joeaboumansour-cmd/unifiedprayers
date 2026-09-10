-- Unified Prayers -- the readings count towards the streak.
--
-- 0005 built prayer_sessions as "one row per completed prayer", and its check
-- constraint said a prayer is a rosary or a chaplet. Finishing the day's
-- readings is now also something a person does and finishes, and it should
-- keep the streak alive: somebody who read the day but did not get to a
-- rosary has not broken anything.
--
-- So the constraint widens by one value. Deliberately a third value on the
-- existing column rather than a new table: a streak is "days with something
-- in them", and the moment that lives in two tables every reader of it has to
-- remember to union them, which is the kind of thing that gets forgotten once
-- and is then quietly wrong for a year.
--
-- WHAT DOES NOT CHANGE, and this is the point of the split downstream:
--
--   The streak counts a readings row. "Prayers this month" and "minutes this
--   month" do not, and `computeStats` filters them out by kind. A reading is
--   not a rosary, and a tile that says "prayers" must not quietly start
--   meaning "things". The seconds are written as 0 for the same reason -- the
--   app does not time reading and must not invent a duration for it.
--
--   `mystery_set` stays null for these rows, which the existing constraint
--   already allows.
--
-- The client id for a readings row is deterministic -- "rd-<date>-<rite>" --
-- so finishing the same day twice, or a second device syncing the same log,
-- writes the same primary key rather than a second row. That is the same
-- idempotence the generated ids give a prayer, arrived at differently because
-- unlike a prayer a day's readings can only be finished once.

alter table public.prayer_sessions
  drop constraint if exists prayer_sessions_prayer_check;

alter table public.prayer_sessions
  add constraint prayer_sessions_prayer_check
  check (prayer in ('spirit', 'mary', 'readings'));

/* A readings row is not a prayer and carries no duration. Enforced here as
   well as in the client, because the anon key means the client is not the only
   thing that can write, and a readings row claiming twenty minutes would put
   time into a total that is meant to mean time spent praying. */
alter table public.prayer_sessions
  drop constraint if exists prayer_sessions_readings_shape;

alter table public.prayer_sessions
  add constraint prayer_sessions_readings_shape
  check (prayer <> 'readings' or (seconds = 0 and mystery_set is null));
