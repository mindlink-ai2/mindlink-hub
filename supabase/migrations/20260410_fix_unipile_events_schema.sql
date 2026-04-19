-- Ajoute les colonnes manquantes attendues par le webhook Unipile
-- Bug PGRST204 : unipile_account_id et raw absentes de unipile_events

ALTER TABLE public.unipile_events
  ADD COLUMN IF NOT EXISTS unipile_account_id text;

ALTER TABLE public.unipile_events
  ADD COLUMN IF NOT EXISTS raw jsonb;

-- Index pour les lookups par compte Unipile
CREATE INDEX IF NOT EXISTS idx_unipile_events_account_id
  ON public.unipile_events(unipile_account_id);

-- Index pour les queries par client (utile pour le dashboard analytics)
CREATE INDEX IF NOT EXISTS idx_unipile_events_client_received
  ON public.unipile_events(client_id, received_at DESC);

-- Recharge le schema cache PostgREST
NOTIFY pgrst, 'reload schema';
