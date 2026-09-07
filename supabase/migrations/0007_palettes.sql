-- Unified Prayers -- two palettes, dark and light.
--
-- The palettes stopped being an accent swapped onto one dark design. There
-- are now two whole schemes, midnight and linen, and the picker is a single
-- control split down the middle rather than a grid of chips. Four of the six
-- old names are gone (rose, lavender, salmon, sand, and now sage as well).
--
-- The check constraint is duplicated from the TypeScript union on purpose --
-- the anon key lets anyone shape a request -- so it has to move with the
-- union. Rows naming a dropped palette are remapped to midnight, the default,
-- before the new constraint goes on. That is a visible change for whoever
-- chose one of them, and it is the only option: the CSS for those palettes no
-- longer exists, so the app would fall back to midnight at paint time anyway
-- while the stored value said otherwise.

alter table public.user_prefs
  drop constraint if exists user_prefs_palette_check;

update public.user_prefs
   set palette = 'midnight'
 where palette not in ('midnight', 'linen');

alter table public.user_prefs
  add constraint user_prefs_palette_check
  check (palette in ('midnight', 'linen'));
