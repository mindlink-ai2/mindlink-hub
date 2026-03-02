-- Supabase Cron schedule for linkedin-cron-runner
--
-- Preconditions:
-- 1) Deploy Edge Function `linkedin-cron-runner`
-- 2) Set secrets: LINKEDIN_CRON_SECRET, UNIPILE_DSN, UNIPILE_API_KEY
-- 3) Replace placeholders below (<PROJECT_REF>, <SERVICE_ROLE_JWT>, <CRON_SECRET>)

-- Remove existing schedule if needed
select cron.unschedule('linkedin-cron-runner-every-5-min')
where exists (
  select 1 from cron.job where jobname = 'linkedin-cron-runner-every-5-min'
);

-- Every 5 minutes; function itself enforces local window (>=08:00 and between start/end).
select cron.schedule(
  'linkedin-cron-runner-every-5-min',
  '*/5 * * * *',
  $$
  select
    net.http_post(
      url := 'https://<PROJECT_REF>.supabase.co/functions/v1/linkedin-cron-runner',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <SERVICE_ROLE_JWT>',
        'x-cron-secret', '<CRON_SECRET>'
      ),
      body := jsonb_build_object('source', 'pg_cron')
    );
  $$
);
