-- Unified Prayers -- a third palette: ember.
--
-- Deep red ground, the gold the app already wears. It is the launch screen's
-- own colouring carried into the app, so somebody who likes the dove they
-- open on can keep it.
--
-- The check constraint is duplicated from the TypeScript union on purpose --
-- the anon key lets anyone shape a request -- so it has to move with the
-- union. Nothing is remapped here, unlike 0007: this migration only widens
-- what is allowed, and every name already stored stays valid.

alter table public.user_prefs
  drop constraint if exists user_prefs_palette_check;

alter table public.user_prefs
  add constraint user_prefs_palette_check
  check (palette in ('midnight', 'linen', 'ember'));
