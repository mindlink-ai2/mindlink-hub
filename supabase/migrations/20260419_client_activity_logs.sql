-- Timeline des actions client (auto + manuelles), affichée dans le panel admin.
CREATE TABLE IF NOT EXISTS client_activity_logs (
  id BIGSERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_activity_logs_org_created
  ON client_activity_logs (org_id, created_at DESC);

COMMENT ON TABLE client_activity_logs IS 'Timeline des événements par client (sheet_created, leads_extracted, messages_validated, workflow_created, etc.)';
COMMENT ON COLUMN client_activity_logs.action IS 'sheet_created | leads_extracted | messages_validated | messages_updated | workflow_created | workflow_updated | icp_submitted | icp_modified | credits_consumed';
