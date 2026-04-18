-- Migration: Credits auto-reset every 31 days
-- Set credits_total to 5 for all existing rows
-- Ensure period_start is populated

UPDATE search_credits SET credits_total = 5;

-- For rows missing period_start, populate from clients.created_at
UPDATE search_credits sc
SET period_start = c.created_at
FROM clients c
WHERE sc.org_id = c.id
  AND sc.period_start IS NULL;
