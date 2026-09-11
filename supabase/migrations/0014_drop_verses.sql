-- Unified Prayers -- retire the verse of the day.
--
-- 0003 made `verses`: an admin-curated list shown as one "verse of the day"
-- card to everybody, pinned to a date or rotated one a day. The daily verse
-- notification (0013) replaced it with a verse chosen per reader, from the
-- topics they pick, out of scripture bundled with the app -- and the card, the
-- admin panel that edited this table and the hook that read it are gone.
--
-- Nothing reads or writes the table any more, and it was empty when this was
-- written. Dropping it takes its policies, indexes and touch trigger with it;
-- the shared touch function stays, since other tables still use it.

drop table if exists public.verses;
