-- 175: Poll YouTube comments every 5 minutes (YouTube has no comment webhooks)
--
-- BEFORE RUNNING:
--   1. Set YOUTUBE_POLL_SECRET in Vercel env vars (any long random string) and redeploy
--   2. Replace <YOUTUBE_POLL_SECRET> below with the same value

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('yt-comment-poll') where exists (select 1 from cron.job where jobname = 'yt-comment-poll');

select cron.schedule(
  'yt-comment-poll',
  '*/5 * * * *',
  $$
  select net.http_get(
    url     := 'https://mybuddy-inky.vercel.app/api/youtube/poll',
    headers := '{"Authorization":"Bearer <YOUTUBE_POLL_SECRET>"}'::jsonb
  ) as request_id;
  $$
);
