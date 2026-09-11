-- Unified Prayers -- the readings in the reader's language.
--
-- 0010 keyed a day's readings on (date, rite): one church, one day, one text.
-- That was one language per church by accident of the sources -- evangelizo
-- serves the Catholic calendars in Arabic, orthocal serves the Orthodox one in
-- English -- and the app has an Arabic/English switch that the readings could
-- not follow.
--
-- Now a day can carry the same readings twice, once per language, and the
-- language is the third part of the key:
--
--   maronite   'ar'  evangelizo MAA  the Maronite liturgical translation
--              'en'  evangelizo MAE  the same lectionary, in English (NRSV)
--
--   byzantine  'en'  orthocal        the King James Version
--              'ar'  orthocal refs,  Van Dyck -- looked up verse for verse
--                    Van Dyck text   against orthocal's references, not
--                                    translated by anybody here. Van Dyck is
--                                    public domain. See src/lib/server/vanDyck.ts.
--
-- The other Catholic calendars stay one language until their source serves
-- another. The client asks for every row of a (date, rite) and picks the one
-- in the reader's language, falling back to whichever exists -- so a church
-- with one language still shows its readings to everybody, as it did before.
--
-- `lang` is what the *text* is in. Armenian's evangelizo feed is in Armenian,
-- which is neither of the app's two languages; it is marked 'hy' so no reader
-- is told it is theirs.

alter table public.daily_readings
  add column if not exists lang text not null default 'ar';

alter table public.daily_readings
  drop constraint if exists daily_readings_lang_check;

alter table public.daily_readings
  add constraint daily_readings_lang_check check (lang in ('ar', 'en', 'hy'));

/* The rows already here, labelled for what they actually are. The default of
   'ar' is right for evangelizo's Arabic calendars and wrong for the other two. */
update public.daily_readings set lang = 'en' where source = 'orthocal.info';
update public.daily_readings set lang = 'hy' where rite = 'armenian';

/* The key widens by one column. Every existing row is still unique under it --
   (date, rite) was unique already -- so this cannot fail on the data. */
alter table public.daily_readings
  drop constraint if exists daily_readings_pkey;

alter table public.daily_readings
  add primary key (on_date, rite, lang);

-- The public-read policy from 0010 is on the table, not on the key, and needs
-- nothing: a row in another language is no more private than the first one.
