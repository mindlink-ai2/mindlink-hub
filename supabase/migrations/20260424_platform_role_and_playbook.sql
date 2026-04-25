-- Migration: platform_role + playbook_enabled on clients
-- HOW TO APPLY: copy this SQL into Supabase Dashboard > SQL Editor > New Query > Run.
-- Do NOT use the Supabase CLI (not configured on this project).
--
-- ⚠️ SUPERSEDED on 2026-04-25 by 20260424_simplify_platform_role_to_admin.sql
-- The 2-tier role system (platform_admin + analytics_admin) introduced here
-- was simplified to a single 'admin' role. The columns and index added by
-- this migration are still in use; only the CHECK constraint was replaced.
--
-- Replaces the hard-coded allowlists in lib/support-admin-auth.ts
-- (SUPPORT_ADMIN_CLIENT_IDS, ANALYTICS_ADMIN_CLIENT_IDS, PLAYBOOK_ALLOWED_CLIENT_IDS, TEST_ORG_IDS)
-- with DB-driven flags. Fully idempotent — safe to replay.

-- 1. Columns (IF NOT EXISTS makes ADD COLUMN idempotent)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS platform_role text NULL;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS playbook_enabled boolean NOT NULL DEFAULT false;

-- 2. CHECK constraint (drop-then-add pattern for idempotency)
ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_platform_role_check;

ALTER TABLE clients
  ADD CONSTRAINT clients_platform_role_check
  CHECK (platform_role IS NULL OR platform_role IN ('platform_admin', 'analytics_admin'));

-- 3. Backfill platform_role — only touch rows still NULL, so manual changes
--    made between runs (e.g. promoting id 24 to analytics_admin) survive a replay.
UPDATE clients SET platform_role = 'platform_admin'
  WHERE id = 24 AND platform_role IS NULL;
UPDATE clients SET platform_role = 'analytics_admin'
  WHERE id IN (16, 18) AND platform_role IS NULL;

-- 4. Backfill playbook_enabled — same guard: only flip rows still false.
--    PLAYBOOK_ALLOWED_CLIENT_IDS = 16, 18, 70, 74
UPDATE clients SET playbook_enabled = true
  WHERE id IN (16, 18, 70, 74) AND playbook_enabled = false;

-- 5. Backfill is_test (TEST_ORG_IDS = 16, 18) — guarded in case column is absent
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clients'
      AND column_name = 'is_test'
  ) THEN
    UPDATE clients SET is_test = true WHERE id IN (16, 18) AND is_test = false;
  END IF;
END $$;

-- Index for fast lookup by platform_role (used in every admin route)
CREATE INDEX IF NOT EXISTS clients_platform_role_idx
  ON clients (platform_role)
  WHERE platform_role IS NOT NULL;

-- 6. Post-migration sanity check — visible in SQL Editor output
DO $$
DECLARE
  v_platform_admins int;
  v_analytics_admins int;
  v_playbook_enabled int;
BEGIN
  SELECT COUNT(*) INTO v_platform_admins
    FROM clients WHERE platform_role = 'platform_admin';
  SELECT COUNT(*) INTO v_analytics_admins
    FROM clients WHERE platform_role = 'analytics_admin';
  SELECT COUNT(*) INTO v_playbook_enabled
    FROM clients WHERE playbook_enabled = true;

  RAISE NOTICE 'platform_admin count: % (expected >= 1)', v_platform_admins;
  RAISE NOTICE 'analytics_admin count: % (expected >= 2)', v_analytics_admins;
  RAISE NOTICE 'playbook_enabled count: % (expected >= 4)', v_playbook_enabled;

  IF v_platform_admins < 1 THEN
    RAISE WARNING 'platform_admin count below expected (% < 1)', v_platform_admins;
  END IF;
  IF v_analytics_admins < 2 THEN
    RAISE WARNING 'analytics_admin count below expected (% < 2)', v_analytics_admins;
  END IF;
  IF v_playbook_enabled < 4 THEN
    RAISE WARNING 'playbook_enabled count below expected (% < 4)', v_playbook_enabled;
  END IF;
END $$;
