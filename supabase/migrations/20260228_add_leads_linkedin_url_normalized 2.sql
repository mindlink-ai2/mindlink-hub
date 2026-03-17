ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS linkedin_url_normalized TEXT;

CREATE INDEX IF NOT EXISTS leads_client_liurlnorm_idx
  ON public.leads (client_id, linkedin_url_normalized);
