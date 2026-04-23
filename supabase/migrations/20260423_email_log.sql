-- Journal des emails transactionnels envoyés à chaque client.
-- Permet idempotence ("a-t-on déjà envoyé X à ce client ?") et audit pour le panel admin.
CREATE TABLE IF NOT EXISTS email_log (
  id BIGSERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  recipient TEXT,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error TEXT,
  metadata JSONB,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_org_kind
  ON email_log (org_id, kind);

CREATE INDEX IF NOT EXISTS idx_email_log_org_sent
  ON email_log (org_id, sent_at DESC);

COMMENT ON TABLE email_log IS 'Emails transactionnels envoyés (welcome, setup_reminder_j3, first_prospects, renewal_d3, renewal_leads, completion_leads).';
COMMENT ON COLUMN email_log.kind IS 'welcome | setup_reminder_j3 | first_prospects | renewal_d3 | renewal_leads | completion_leads';
COMMENT ON COLUMN email_log.status IS 'sent | failed | skipped';
