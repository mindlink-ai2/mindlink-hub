ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS linkedin_provider_id TEXT;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS linkedin_public_identifier TEXT;

CREATE INDEX IF NOT EXISTS leads_client_linkedin_provider_idx
  ON public.leads (client_id, linkedin_provider_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leads'
      AND column_name = 'linkedin_url'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS leads_client_linkedin_url_idx ON public.leads (client_id, linkedin_url)';
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leads'
      AND column_name = 'LinkedInURL'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS leads_client_linkedin_url_idx ON public.leads (client_id, "LinkedInURL")';
  END IF;
END $$;

