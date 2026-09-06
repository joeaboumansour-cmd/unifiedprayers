-- Unified Prayers -- the hourly tick that delivers scheduled notifications and
-- the nightly reminder.
--
-- NOT a migration, and deliberately not in supabase/migrations: it embeds the
-- deployment's own URL and its CRON_SECRET, so it is per-environment and must
-- not be committed with those values filled in. Fill them in, run it once in
-- the SQL editor, and keep this file as the template it is.
--
-- Why here rather than Vercel Cron: Vercel's Hobby plan runs a cron job once a
-- day, and once a day cannot serve a reminder that is "9pm where you are" --
-- every timezone needs its own hour. pg_cron runs every hour on any Supabase
-- plan. If you are on Vercel Pro, the alternative is a `crons` entry in
-- vercel.json hitting the same endpoint; do one or the other, not both.

-- ------------------------------------------------------------ extensions --

-- pg_cron schedules; pg_net makes the outbound HTTP call. Both ship with
-- Supabase and are enabled per project.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ------------------------------------------------------------- the job --

-- Replace both placeholders before running:
--   https://your-app.vercel.app   the deployment's own origin
--   YOUR_CRON_SECRET              the exact value of the CRON_SECRET env var
--
-- The endpoint refuses anything without that bearer token, so a wrong value
-- here shows up as nothing ever being delivered rather than as an error.

select cron.schedule(
  'unified-prayers-notifications',
  -- On the hour. The reminder sweep only sends to devices whose local clock has
  -- just reached their chosen hour, so this is the resolution it needs.
  '0 * * * *',
  $$
  select net.http_post(
    url     := 'https://your-app.vercel.app/api/cron/notifications',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    ),
    timeout_milliseconds := 55000
  );
  $$
);

-- ---------------------------------------------------------------- checks --

-- What is scheduled:
--   select jobid, jobname, schedule, active from cron.job;
--
-- What happened on the last few runs:
--   select status, return_message, start_time
--     from cron.job_run_details
--    where jobname = 'unified-prayers-notifications'
--    order by start_time desc limit 10;
--
-- pg_net records the response separately -- a 200 here with a 403 body means
-- the secret does not match:
--   select status_code, content, created
--     from net._http_response order by created desc limit 10;
--
-- To stop it:
--   select cron.unschedule('unified-prayers-notifications');
