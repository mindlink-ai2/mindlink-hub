-- Remove the rigid quota check constraint (10/20/30 only).
-- Quota is now free-form; the source of truth is clients.quota.
ALTER TABLE public.client_linkedin_settings
  DROP CONSTRAINT IF EXISTS client_linkedin_settings_daily_quota_check;
