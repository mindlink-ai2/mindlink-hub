-- Add source column to extraction_logs to distinguish admin vs client selections
ALTER TABLE extraction_logs
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'admin';

COMMENT ON COLUMN extraction_logs.source IS 'admin = extraction admin, client_selection = sélection par le client';
