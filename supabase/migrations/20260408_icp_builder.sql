-- Migration: ICP Builder feature
-- Tables: icp_configs, search_credits, search_logs, extraction_logs, admin_notifications
-- RLS policies + RPC for atomic credit decrement

-- ============================================================
-- 1. icp_configs — Config ICP par client
-- ============================================================
CREATE TABLE IF NOT EXISTS icp_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  filters JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'reviewed', 'active')),
  preview_profiles JSONB DEFAULT '[]',
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS icp_configs_org_id_idx ON icp_configs(org_id);

-- ============================================================
-- 2. search_credits — Crédits de recherche de prévisualisation
-- ============================================================
CREATE TABLE IF NOT EXISTS search_credits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  credits_total INT NOT NULL DEFAULT 15,
  credits_used INT NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ DEFAULT now(),
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS search_credits_org_id_unique ON search_credits(org_id);

-- ============================================================
-- 3. search_logs — Logs des recherches de prévisualisation
-- ============================================================
CREATE TABLE IF NOT EXISTS search_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  filters_used JSONB NOT NULL,
  results_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS search_logs_org_id_idx ON search_logs(org_id);

-- ============================================================
-- 4. extraction_logs — Logs des extractions complètes
-- ============================================================
CREATE TABLE IF NOT EXISTS extraction_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  icp_config_id UUID REFERENCES icp_configs(id),
  leads_count INT NOT NULL DEFAULT 0,
  google_sheet_url TEXT,
  google_sheet_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS extraction_logs_org_id_idx ON extraction_logs(org_id);

-- ============================================================
-- 5. admin_notifications — Notifications pour les admins
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL,
  org_id BIGINT,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. RPC — Décrémenter les crédits atomiquement
-- ============================================================
CREATE OR REPLACE FUNCTION decrement_search_credit(p_org_id BIGINT)
RETURNS BOOLEAN AS $$
DECLARE
  v_found BOOLEAN;
BEGIN
  UPDATE search_credits
  SET credits_used = credits_used + 1,
      updated_at = now()
  WHERE org_id = p_org_id
    AND credits_used < credits_total;

  GET DIAGNOSTICS v_found = ROW_COUNT;
  RETURN v_found > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. RLS Policies
-- ============================================================

-- icp_configs
ALTER TABLE icp_configs ENABLE ROW LEVEL SECURITY;

-- Clients voient uniquement leur propre config
CREATE POLICY icp_configs_client_select ON icp_configs
  FOR SELECT
  USING (
    org_id IN (
      SELECT id FROM clients WHERE clerk_user_id = auth.uid()::text
    )
  );

CREATE POLICY icp_configs_client_insert ON icp_configs
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT id FROM clients WHERE clerk_user_id = auth.uid()::text
    )
  );

CREATE POLICY icp_configs_client_update ON icp_configs
  FOR UPDATE
  USING (
    org_id IN (
      SELECT id FROM clients WHERE clerk_user_id = auth.uid()::text
    )
  );

-- search_credits
ALTER TABLE search_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY search_credits_client_select ON search_credits
  FOR SELECT
  USING (
    org_id IN (
      SELECT id FROM clients WHERE clerk_user_id = auth.uid()::text
    )
  );

-- search_logs
ALTER TABLE search_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY search_logs_client_select ON search_logs
  FOR SELECT
  USING (
    org_id IN (
      SELECT id FROM clients WHERE clerk_user_id = auth.uid()::text
    )
  );

-- extraction_logs
ALTER TABLE extraction_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY extraction_logs_client_select ON extraction_logs
  FOR SELECT
  USING (
    org_id IN (
      SELECT id FROM clients WHERE clerk_user_id = auth.uid()::text
    )
  );

-- admin_notifications — uniquement service role (pas de policy SELECT pour anon/user)
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;
-- Aucune policy publique : accès uniquement via service role key
