# LinkedIn Cron Runner (Supabase)

## Goal
Trigger `linkedin-cron-runner` every 5 minutes. The runner itself only processes clients inside their local automation window (default starts at 08:00 Europe/Paris).

## Setup
1. Deploy functions:
- `supabase functions deploy linkedin-cron-runner`
- `supabase functions deploy unipile-webhook`
- `supabase functions deploy linkedin-send-draft`

2. Configure required secrets:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `UNIPILE_DSN`
- `UNIPILE_API_KEY`
- `UNIPILE_WEBHOOK_SECRET`
- `LINKEDIN_CRON_SECRET`
- `LINKEDIN_SEND_SECRET`

3. Create the cron schedule with [`linkedin_cron_schedule.sql`](./linkedin_cron_schedule.sql).

## Notes
- The runner is idempotent and uses a Postgres advisory lock (`try_acquire_linkedin_cron_lock`) to avoid concurrent double-runs.
- It processes max 1 invitation per client per run.
- It ignores clients that are not `plan='full'` and `subscription_status='active'`.
