-- 096: Schedule daily week-off reminder at 9:00 AM IST (3:30 AM UTC)
-- Requires pg_cron and pg_net extensions (enabled in Supabase by default)

-- Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY before running
select cron.schedule(
  'daily-weekoff-reminder',
  '30 3 * * *',
  $$
  select net.http_post(
    url      := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-weekoff-reminder',
    headers  := jsonb_build_object(
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
      'Content-Type',  'application/json'
    ),
    body     := '{}'::jsonb
  );
  $$
);

-- To check scheduled jobs:
-- select * from cron.job;

-- To remove this job later:
-- select cron.unschedule('daily-weekoff-reminder');
