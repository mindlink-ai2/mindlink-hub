-- Migration: simplify platform_role to a single 'admin' value
-- HOW TO APPLY: copy this SQL into Supabase Dashboard > SQL Editor > New Query > Run.
-- Do NOT use the Supabase CLI (not configured on this project).
--
-- HISTORY: this migration was applied manually to production on 2026-04-25
-- after the original 20260424_platform_role_and_playbook.sql introduced a
-- 2-tier hierarchy (platform_admin + analytics_admin) that turned out to be
-- unnecessary. We now use a single 'admin' role for all Lidmeo platform
-- admins (currently ids 16, 18, 24).
--
-- Replaces the previous 2-tier system with a single 'admin' role.
-- Fully idempotent — safe to replay.

-- 1. Drop the old CHECK constraint (which accepted platform_admin/analytics_admin)
ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_platform_role_check;

-- 2. Migrate any remaining legacy values to the unified 'admin' role
UPDATE clients SET platform_role = 'admin'
  WHERE platform_role IN ('platform_admin', 'analytics_admin');

-- 3. Add the new CHECK constraint accepting only 'admin' or NULL
ALTER TABLE clients
  ADD CONSTRAINT clients_platform_role_check
  CHECK (platform_role IS NULL OR platform_role = 'admin');

-- 4. Sanity check — visible in SQL Editor output
DO $$
DECLARE
  v_admins int;
  v_legacy int;
BEGIN
  SELECT COUNT(*) INTO v_admins FROM clients WHERE platform_role = 'admin';
  SELECT COUNT(*) INTO v_legacy FROM clients
    WHERE platform_role IN ('platform_admin', 'analytics_admin');

  RAISE NOTICE 'admin count: % (expected 3 for ids 16, 18, 24)', v_admins;
  RAISE NOTICE 'legacy values remaining: % (expected 0)', v_legacy;

  IF v_legacy > 0 THEN
    RAISE EXCEPTION 'Legacy platform_role values still present, abort.';
  END IF;
END $$;
