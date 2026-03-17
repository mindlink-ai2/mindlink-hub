-- Add relance_sent_at to leads to track when the follow-up LinkedIn message was sent
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS relance_sent_at TIMESTAMPTZ DEFAULT NULL;

-- Index for the cron query: leads due today with pending relance
CREATE INDEX IF NOT EXISTS idx_leads_relance_followup
  ON public.leads (client_id, next_followup_at, relance_sent_at)
  WHERE message_sent = true AND relance_linkedin IS NOT NULL;

-- Lock functions for followup-cron-runner (same table-based pattern as linkedin cron lock)
CREATE OR REPLACE FUNCTION public.try_acquire_followup_cron_lock()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Expire stale locks first
  DELETE FROM public.cron_locks
  WHERE name = 'followup-cron-runner'
    AND expires_at < now();

  INSERT INTO public.cron_locks (name, acquired_at, expires_at)
  VALUES ('followup-cron-runner', now(), now() + INTERVAL '10 minutes')
  ON CONFLICT DO NOTHING;

  RETURN found;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_followup_cron_lock()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.cron_locks WHERE name = 'followup-cron-runner';
  RETURN found;
END;
$$;

GRANT EXECUTE ON FUNCTION public.try_acquire_followup_cron_lock() TO service_role;
GRANT EXECUTE ON FUNCTION public.release_followup_cron_lock() TO service_role;
