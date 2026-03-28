-- Migration : délai de relance configurable
-- Créée le 2026-03-28

-- Délai global par client (défaut 7 jours)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS followup_delay_days INTEGER NOT NULL DEFAULT 7;

-- Délai personnalisé par lead (NULL = utiliser le délai global du client)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS custom_followup_delay_days INTEGER NULL DEFAULT NULL;
