-- Unified Prayers -- the daily readings, mirrored.
--
-- The calendar in this app is arithmetic: it knows what day it is in nine
-- churches without asking anybody. The readings are not, and cannot be. Which
-- passages are appointed for a Thursday in the sixteenth week of Pentecost is
-- a decision each church's liturgical commission publishes, not something a
-- date implies, and none of these churches publishes it as data.
--
-- So this table is a mirror. A nightly job pulls the rolling window that
-- evangelizo.org serves -- their feed refuses any date more than thirty days
-- from today -- and keeps what it finds. The archive is the point: after a year
-- of running the app can show the readings for a date somebody scrolled to and
-- not only for today, which is the difference between a calendar and a
-- homepage.
--
-- ON THE RIGHTS, because this is a table of somebody else's work:
--
--   A reference -- "Luke 18:31-34" -- is a fact, and nobody owns it.
--
--   The text is not. It is a particular translation: for the Maronite rite the
--   Maronite Liturgical Translation of 2007, whose rights sit with the
--   Patriarchal liturgical commission, served by evangelizo.org for display on
--   a page. Mirroring it is fine for building against. Putting it in front of
--   readers needs permission from that commission and from evangelizo.org.
--
--   `source` and `translation` are on every row and are not nullable by
--   accident: a reading shown without an attribution is a reading somebody will
--   assume is ours.
--
--   Evangelizo's own daily commentary is deliberately NOT mirrored. It is their
--   editorial work rather than anybody's liturgy, and there is no version of
--   this app that needs a copy of it.
--
-- If permission is not obtained, the honest build is references only: every
-- reading below carries its own, and the app can render the passage from a
-- public-domain Bible instead.

create table if not exists public.daily_readings (
  -- The day, and the church that appoints them. The pair is the key: nine
  -- churches read nine different things on one date.
  on_date     date not null,
  rite        text not null check (rite in (
                'roman', 'maronite', 'melkite', 'byzantine', 'syriac',
                'syriac-catholic', 'coptic', 'coptic-catholic', 'armenian'
              )),

  /* The day's own title in the source's words -- "الخميس السادس عشر من زمن
     العنصرة". Kept because it is the one field that can be checked against what
     this app computes for the same day, and a mismatch is a bug in the
     calendar. That check has already found two. */
  liturgic_title text,

  /*
   * The readings, in the order the source lists them.
   *
   * A jsonb array rather than columns named first/psalm/epistle/gospel, and
   * that is not laziness. The slots mean different things in different rites:
   * the Roman form reads a first reading, a psalm, an epistle and a gospel; the
   * Maronite reads an epistle and a gospel; the Byzantine one puts a prokeimenon
   * where the Roman puts its first reading, and an alleluia verse where the
   * Roman puts its epistle. Forcing six calendars into four Latin-shaped
   * columns would mislabel most of them.
   *
   * So each entry keeps the label the source gave it, and the app displays that
   * label rather than one of its own:
   *
   *   [{ "kind": "text3" | "gospel",
   *      "label": "رسالة القدّيس يعقوب",   -- what this reading IS, in the rite
   *      "ref":   "يع 5:1-6",              -- the reference. A fact.
   *      "text":  "..." }]                 -- the translation. See above.
   */
  readings jsonb not null default '[]'::jsonb,

  /* The source's own recording of the gospel, as a URL and never as a copy. */
  audio_url text,

  source      text not null default 'evangelizo.org',
  translation text,

  fetched_at  timestamptz not null default now(),

  primary key (on_date, rite)
);

create index if not exists daily_readings_date_idx
  on public.daily_readings (on_date);

-- ------------------------------------------------------------------- RLS --

alter table public.daily_readings enable row level security;

drop policy if exists "readings: public read" on public.daily_readings;

/* Read by anyone, signed in or not: the readings are the same for everybody
   and there is nothing here about a person. Unlike the couples devotion in
   0009 this needs no lock -- what guards it is the rights note above, which is
   a licence question and not one a policy can answer. */
create policy "readings: public read" on public.daily_readings
  for select to anon, authenticated
  using (true);

/* No insert, update or delete policy anywhere. The mirror is written by the
   cron route with the service key, which bypasses RLS; nothing holding an anon
   key can write a reading, which is what stops this table from becoming a place
   to put words into a church's mouth. */
