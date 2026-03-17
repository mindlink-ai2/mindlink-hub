-- client_events table
CREATE TABLE IF NOT EXISTS public.client_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id INTEGER NOT NULL,
  user_id TEXT,
  event_type TEXT NOT NULL,
  event_category TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_client_events_client_id ON public.client_events(client_id);
CREATE INDEX IF NOT EXISTS idx_client_events_event_type ON public.client_events(event_type);
CREATE INDEX IF NOT EXISTS idx_client_events_created_at ON public.client_events(created_at);
CREATE INDEX IF NOT EXISTS idx_client_events_category ON public.client_events(event_category);

-- client_activity_summary table
CREATE TABLE IF NOT EXISTS public.client_activity_summary (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id INTEGER NOT NULL UNIQUE,
  total_logins INTEGER DEFAULT 0,
  last_login_at TIMESTAMPTZ,
  total_prospects_received INTEGER DEFAULT 0,
  total_prospects_viewed INTEGER DEFAULT 0,
  total_messages_sent INTEGER DEFAULT 0,
  total_connections_sent INTEGER DEFAULT 0,
  total_replies_received INTEGER DEFAULT 0,
  total_sessions INTEGER DEFAULT 0,
  avg_session_duration_seconds INTEGER DEFAULT 0,
  last_active_at TIMESTAMPTZ,
  days_since_last_activity INTEGER DEFAULT 0,
  health_score INTEGER DEFAULT 100,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.client_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_activity_summary ENABLE ROW LEVEL SECURITY;

-- Only service_role can read/write (admin dashboard uses service role)
CREATE POLICY "service_role_all_client_events" ON public.client_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_client_activity_summary" ON public.client_activity_summary
  FOR ALL TO service_role USING (true) WITH CHECK (true);
