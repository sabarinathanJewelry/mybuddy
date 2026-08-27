-- Hourly push notification to counter cleanliness supervisor
-- Fires at 9:30, 10:30, ... 21:30 IST (= 04:00–16:00 UTC) Mon–Sat
--
-- BEFORE RUNNING:
--   1. Deploy the edge function:
--        supabase functions deploy counter-check-reminder
--   2. Replace <PROJECT-REF> with your Supabase project reference (e.g. abcdefghijkl)
--   3. Replace <SERVICE-ROLE-KEY> with your service_role key from the Supabase dashboard
--
-- You can also add this job via:
--   Supabase Dashboard → Database → Cron Jobs → Add job

select cron.schedule(
  'counter-check-reminder',
  '0 4-16 * * 1-6',
  $$
  select net.http_post(
    url        := 'https://<PROJECT-REF>.supabase.co/functions/v1/counter-check-reminder',
    headers    := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE-ROLE-KEY>"}'::jsonb,
    body       := '{}'::jsonb
  ) as request_id;
  $$
);
