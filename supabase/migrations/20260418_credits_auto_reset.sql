-- Migration: Credits auto-reset every 31 days
-- Set credits_total to 5 for all existing rows
-- Ensure period_start is populated from search_credits.created_at

UPDATE search_credits SET credits_total = 5;

-- For rows missing period_start, use the row's own created_at as anchor
UPDATE search_credits
SET period_start = created_at
WHERE period_start IS NULL;
