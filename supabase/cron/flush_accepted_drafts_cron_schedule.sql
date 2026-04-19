-- Supabase Cron schedule for flush-accepted-drafts
--
-- Purpose: automatically send post-connection messages for invitations accepted
--          today that still have dm_draft_status != 'sent'.
--          Runs every 5 minutes; route itself enforces 09:00–18:00 Europe/Paris.
--
-- Preconditions:
-- 1) The Next.js app must be deployed and accessible at APP_URL
-- 2) Replace placeholders below (<APP_URL>, <CRON_SECRET>)
--    Use the same LINKEDIN_CRON_SECRET as the other cron runners

-- Remove existing schedule if needed
SELECT cron.unschedule('flush-accepted-drafts-every-5-min')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'flush-accepted-drafts-every-5-min'
);

-- Every 5 minutes; route enforces local window (09:00–18:00 Europe/Paris).
SELECT cron.schedule(
  'flush-accepted-drafts-every-5-min',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://hub.lidmeo.com/api/prospection/flush-accepted-drafts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', 'my_super_secret_cron_2026'
      ),
      body := jsonb_build_object('source', 'pg_cron')
    );
  $$
);