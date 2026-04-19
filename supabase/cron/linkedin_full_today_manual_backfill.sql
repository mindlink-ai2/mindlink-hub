-- Manual catch-up for today's LinkedIn invitations on FULL plan clients.
--
-- Purpose:
-- - catch up today's leads that have not yet received a LinkedIn invitation
-- - rely on the deployed `linkedin-cron-runner` so we keep:
--   * full-plan-only logic
--   * active subscription checks
--   * LinkedIn/Unipile account checks
--   * invitation dedupe / idempotence
--   * detailed automation logs
--
-- Important:
-- - This script triggers the existing runner every 10 seconds.
-- - The runner still sends at most 1 invitation per pass and per client.
-- - So one pass may send multiple invitations overall when several clients are eligible.
-- - The runner still enforces its local weekday / time window rules.
--
-- Preconditions:
-- 1) Latest `linkedin-cron-runner` must already be deployed
-- 2) Replace the values inside the dollar-quoted markers below before running
-- 3) Run this during the allowed sending window

-- Preview: today's pending backlog by FULL client (Europe/Paris day)
WITH paris_bounds AS (
  SELECT
    (date_trunc('day', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris') AS start_at,
    ((date_trunc('day', now() AT TIME ZONE 'Europe/Paris') + interval '1 day') AT TIME ZONE 'Europe/Paris') AS end_at
),
eligible_clients AS (
  SELECT c.id
  FROM public.clients c
  LEFT JOIN public.client_linkedin_settings cls
    ON cls.client_id = c.id
  WHERE lower(coalesce(c.plan, '')) = 'full'
    AND lower(coalesce(c.subscription_status, '')) = 'active'
    AND (
      nullif(btrim(coalesce(cls.unipile_account_id, '')), '') IS NOT NULL
      OR EXISTS (
        SELECT 1
        FROM public.unipile_accounts ua
        WHERE ua.client_id = c.id
          AND lower(coalesce(ua.provider, '')) = 'linkedin'
          AND nullif(btrim(coalesce(ua.unipile_account_id, '')), '') IS NOT NULL
      )
    )
),
pending_today_by_client AS (
  SELECT
    l.client_id,
    count(*)::integer AS pending_count
  FROM public.leads l
  JOIN eligible_clients ec
    ON ec.id = l.client_id
  CROSS JOIN paris_bounds b
  WHERE l.created_at >= b.start_at
    AND l.created_at < b.end_at
    AND nullif(btrim(coalesce(l."LinkedInURL", '')), '') IS NOT NULL
    AND coalesce(l.responded, false) = false
    AND coalesce(l.message_sent, false) = false
    AND NOT EXISTS (
      SELECT 1
      FROM public.linkedin_invitations li
      WHERE li.client_id = l.client_id
        AND li.lead_id = l.id
        AND (
          li.sent_at IS NOT NULL
          OR li.accepted_at IS NOT NULL
          OR li.dm_sent_at IS NOT NULL
          OR lower(coalesce(li.status, '')) IN ('pending', 'sent', 'accepted', 'connected')
        )
    )
  GROUP BY l.client_id
)
SELECT *
FROM pending_today_by_client
ORDER BY pending_count DESC, client_id;

DO $$
DECLARE
  v_project_ref text := 'ecvzrnhufpwlqjcfvqum';
  v_service_role_jwt text := $service_role_jwt$REPLACE_WITH_SUPABASE_SERVICE_ROLE_KEY$service_role_jwt$;
  v_cron_secret text := $cron_secret$REPLACE_WITH_LINKEDIN_CRON_SECRET$cron_secret$;
  v_runner_url text := format(
    'https://%s.supabase.co/functions/v1/linkedin-cron-runner',
    v_project_ref
  );
  v_total_clients integer := 0;
  v_total_leads integer := 0;
  v_max_passes integer := 0;
  v_pass integer := 0;
  v_request_id bigint;
BEGIN
  IF v_service_role_jwt = 'REPLACE_WITH_SUPABASE_SERVICE_ROLE_KEY'
     OR v_cron_secret = 'REPLACE_WITH_LINKEDIN_CRON_SECRET' THEN
    RAISE EXCEPTION 'Replace the service role key and cron secret before running this script.';
  END IF;

  WITH paris_bounds AS (
    SELECT
      (date_trunc('day', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris') AS start_at,
      ((date_trunc('day', now() AT TIME ZONE 'Europe/Paris') + interval '1 day') AT TIME ZONE 'Europe/Paris') AS end_at
  ),
  eligible_clients AS (
    SELECT c.id
    FROM public.clients c
    LEFT JOIN public.client_linkedin_settings cls
      ON cls.client_id = c.id
    WHERE lower(coalesce(c.plan, '')) = 'full'
      AND lower(coalesce(c.subscription_status, '')) = 'active'
      AND (
        nullif(btrim(coalesce(cls.unipile_account_id, '')), '') IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.unipile_accounts ua
          WHERE ua.client_id = c.id
            AND lower(coalesce(ua.provider, '')) = 'linkedin'
            AND nullif(btrim(coalesce(ua.unipile_account_id, '')), '') IS NOT NULL
        )
      )
  ),
  pending_today_by_client AS (
    SELECT
      l.client_id,
      count(*)::integer AS pending_count
    FROM public.leads l
    JOIN eligible_clients ec
      ON ec.id = l.client_id
    CROSS JOIN paris_bounds b
    WHERE l.created_at >= b.start_at
      AND l.created_at < b.end_at
      AND nullif(btrim(coalesce(l."LinkedInURL", '')), '') IS NOT NULL
      AND coalesce(l.responded, false) = false
      AND coalesce(l.message_sent, false) = false
      AND NOT EXISTS (
        SELECT 1
        FROM public.linkedin_invitations li
        WHERE li.client_id = l.client_id
          AND li.lead_id = l.id
          AND (
            li.sent_at IS NOT NULL
            OR li.accepted_at IS NOT NULL
            OR li.dm_sent_at IS NOT NULL
            OR lower(coalesce(li.status, '')) IN ('pending', 'sent', 'accepted', 'connected')
          )
      )
    GROUP BY l.client_id
  )
  SELECT
    coalesce(count(*), 0)::integer,
    coalesce(sum(pending_count), 0)::integer,
    coalesce(max(pending_count), 0)::integer
  INTO v_total_clients, v_total_leads, v_max_passes
  FROM pending_today_by_client;

  RAISE NOTICE 'FULL plan catch-up today (Europe/Paris): % clients, % leads, % passes.',
    v_total_clients, v_total_leads, v_max_passes;

  IF v_max_passes = 0 THEN
    RAISE NOTICE 'No pending lead found for today. Nothing to do.';
    RETURN;
  END IF;

  FOR v_pass IN 1..v_max_passes LOOP
    SELECT net.http_post(
      url := v_runner_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role_jwt,
        'x-cron-secret', v_cron_secret
      ),
      body := jsonb_build_object(
        'source', 'manual_sql_backfill_today_full',
        'pass', v_pass,
        'max_passes', v_max_passes,
        'timezone', 'Europe/Paris'
      )
    )
    INTO v_request_id;

    RAISE NOTICE 'Queued pass %/% (request_id=%).', v_pass, v_max_passes, v_request_id;

    IF v_pass < v_max_passes THEN
      PERFORM pg_sleep(10);
    END IF;
  END LOOP;
END
$$;
