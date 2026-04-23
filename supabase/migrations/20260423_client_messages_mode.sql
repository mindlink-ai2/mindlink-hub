-- Distingue les 2 parcours de saisie des messages de prospection :
--   chat    : l'assistant Lidmeo pose les 4 questions DAPS puis génère les messages
--   manual  : le client écrit directement ses 2 messages (ouverture + relance)
-- Le mode conditionne le chemin de génération du prompt système n8n.
ALTER TABLE client_messages
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'chat';

ALTER TABLE client_messages
  DROP CONSTRAINT IF EXISTS client_messages_mode_check;

ALTER TABLE client_messages
  ADD CONSTRAINT client_messages_mode_check
  CHECK (mode IN ('chat', 'manual'));

COMMENT ON COLUMN client_messages.mode IS 'chat | manual — parcours utilisé pour saisir les messages';
