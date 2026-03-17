-- Supabase Cron schedule for followup-cron-runner
--
-- Preconditions:
-- 1) Apply migration: 20260317_add_relance_followup_cron.sql
-- 2) Deploy Edge Function `followup-cron-runner`
-- 3) Replace placeholders below (<PROJECT_REF>, <SERVICE_ROLE_JWT>, <CRON_SECRET>)
--    (same LINKEDIN_CRON_SECRET used by linkedin-cron-runner)

-- Remove existing schedule if needed
SELECT cron.unschedule('followup-cron-runner-every-5-min')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'followup-cron-runner-every-5-min'
);

-- Every 5 minutes; function itself enforces local window (09:00–18:00).
SELECT cron.schedule(
  'followup-cron-runner-every-5-min',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://<PROJECT_REF>.supabase.co/functions/v1/followup-cron-runner',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <SERVICE_ROLE_JWT>',
        'x-cron-secret', '<CRON_SECRET>'
      ),
      body := jsonb_build_object('source', 'pg_cron')
    );
  $$
);
