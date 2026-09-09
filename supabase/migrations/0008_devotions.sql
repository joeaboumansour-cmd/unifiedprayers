-- Unified Prayers -- the daily devotions.
--
-- Two printed books, one page per calendar day: one written for a person
-- praying alone, one for a couple praying together. They are transcribed a day
-- at a time from the physical copies, so this table fills in slowly and is
-- expected to be mostly empty for a long while. Nothing anywhere assumes a
-- given day has an entry.
--
-- Three things make this different from `verses`, which is otherwise the
-- closest table in the schema:
--
--   1. The key is a calendar day, not a date. A page headed "8 September"
--      belongs to the 8th of September every year, so the year is not stored
--      and the page is transcribed once.
--   2. Reading it early is the thing being prevented. A verse is published to
--      be seen; a devotion is sealed until its day arrives, which makes the
--      day check a policy rather than a client-side filter. Without it anyone
--      holding the anon key could pull the whole year out of PostgREST the day
--      the first page is typed.
--   3. The body is an ordered list of paragraphs rather than one string, so
--      the reader can hand them over one tap at a time.

-- ------------------------------------------------------------------- due --

-- Whether a calendar day is close enough to now to be readable.
--
-- The window is the UTC date plus or minus one day, and its width is not
-- decoration: the device decides which page is "today" from its own clock, and
-- local dates run from UTC-12 to UTC+14. One day either side is the narrowest
-- window that is correct in every timezone. It costs a reader in London the
-- ability to see tomorrow's page late in the evening, which is the fair price
-- for one that is never wrong the other way.
--
-- February 29th is readable only in a leap year: current_date + 1 cannot land
-- on a date that does not exist, so on the 28th of a common year the 29th is
-- simply never due. That is the correct reading of a book with a page for it.
create or replace function public.devotion_is_due(m integer, d integer)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from generate_series(-1, 1) as k(offs)
     where extract(month from (current_date + k.offs))::integer = m
       and extract(day   from (current_date + k.offs))::integer = d
  );
$$;

grant execute on function public.devotion_is_due(integer, integer) to anon, authenticated;

-- -------------------------------------------------------------- devotions --

create table if not exists public.daily_devotions (
  id       uuid primary key default gen_random_uuid(),

  -- Which book the page came out of. A column rather than two tables: the two
  -- are the same shape, the same screen reads both, and moving a page from one
  -- to the other should be a dropdown rather than a migration.
  track    text not null check (track in ('individual', 'couples')),

  -- The calendar day, split rather than stored as a date, because there is no
  -- year to store. Split is also what makes the uniqueness below expressible.
  month    smallint not null check (month between 1 and 12),
  day      smallint not null check (day   between 1 and 31),

  -- Arabic is required and English is not, which is the opposite of the rule
  -- every other publishable row in this schema follows. The books exist on
  -- paper in Arabic only; requiring a translation would mean 732 pages cannot
  -- be entered until someone has translated 732 pages, and an app with no
  -- devotions in it serves nobody in either language. The reader falls back to
  -- the Arabic wherever the English is missing.
  title_ar        text not null check (length(trim(title_ar)) between 1 and 200),
  title_en        text          check (title_en is null or length(title_en) <= 200),

  -- The verse under the title.
  verse_ar        text not null check (length(trim(verse_ar)) between 1 and 1200),
  verse_en        text          check (verse_en is null or length(verse_en) <= 1200),
  verse_ref_ar    text          check (verse_ref_ar is null or length(verse_ref_ar) <= 160),
  verse_ref_en    text          check (verse_ref_en is null or length(verse_ref_en) <= 160),

  -- The prayer itself, one element per paragraph, in reading order. An array
  -- rather than one blob with blank lines in it, because the reader hands
  -- these over a tap at a time and "where does a paragraph end" must not be a
  -- question the client re-answers by parsing.
  body_ar         text[] not null,
  body_en         text[],

  -- The closing quotation and whoever it is attributed to. Optional: not every
  -- page in either book ends with one.
  quote_ar        text          check (quote_ar is null or length(quote_ar) <= 1200),
  quote_en        text          check (quote_en is null or length(quote_en) <= 1200),
  quote_source_ar text          check (quote_source_ar is null or length(quote_source_ar) <= 160),
  quote_source_en text          check (quote_source_en is null or length(quote_source_en) <= 160),

  -- The manual switch, the same job it does on `verses`: take a page off the
  -- screen without deleting the transcription.
  active     boolean not null default true,

  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One page per day per book. This is what makes re-entering a day an edit
  -- rather than a second copy nobody notices until both turn up on the screen.
  constraint daily_devotions_one_per_day unique (track, month, day),

  -- No 31st of September. February keeps 29 in either kind of year -- the page
  -- is transcribed once and read only in the years the day exists.
  constraint daily_devotions_real_date check (
    day <= case month
             when 2  then 29
             when 4  then 30
             when 6  then 30
             when 9  then 30
             when 11 then 30
             else 31
           end
  ),

  -- Between one and forty paragraphs, holding something. Postgres will not
  -- take a subquery in a CHECK, so "no empty element" is approximated by the
  -- joined length -- enough to reject an array of blanks, and the panel trims
  -- and drops empties long before anything reaches here.
  constraint daily_devotions_body check (
    cardinality(body_ar) between 1 and 40
    and length(trim(array_to_string(body_ar, ' '))) between 1 and 20000
  ),
  constraint daily_devotions_body_en check (
    body_en is null
    or (cardinality(body_en) between 1 and 40
        and length(array_to_string(body_en, ' ')) <= 20000)
  ),

  -- An attribution with nothing to attribute is a stray name under a blank.
  constraint daily_devotions_quote check (
    quote_source_ar is null or quote_ar is not null
  )
);

-- The reader asks for one (month, day); the panel lists in calendar order.
-- One index covers both.
create index if not exists daily_devotions_day_idx
  on public.daily_devotions (month, day, track);

alter table public.daily_devotions enable row level security;

drop trigger if exists daily_devotions_touch on public.daily_devotions;
create trigger daily_devotions_touch
  before update on public.daily_devotions
  for each row execute function public.touch_updated_at();

drop policy if exists "devotions: public read due"  on public.daily_devotions;
drop policy if exists "devotions: admin read all"   on public.daily_devotions;
drop policy if exists "devotions: admin write"      on public.daily_devotions;

-- Anonymous readers included, like the verse and the prayer text: the app is
-- fully usable signed out. The day check is the seal, and it is here rather
-- than in the client because a client-side seal is not one.
create policy "devotions: public read due" on public.daily_devotions
  for select to anon, authenticated
  using (active and public.devotion_is_due(month, day));

-- An admin sees every page, which is what makes the panel's list of what has
-- been entered possible. The reader on their own device still asks for one
-- exact day, so this does not put next week's page on their home screen.
create policy "devotions: admin read all" on public.daily_devotions
  for select to authenticated using (public.is_admin());

create policy "devotions: admin write" on public.daily_devotions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
