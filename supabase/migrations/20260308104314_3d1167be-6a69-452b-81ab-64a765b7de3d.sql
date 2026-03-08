
CREATE TABLE public.ai_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_hash TEXT NOT NULL UNIQUE,
  ai_response TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_cache_hash ON public.ai_cache(input_hash);
CREATE INDEX idx_ai_cache_created ON public.ai_cache(created_at);
CREATE INDEX idx_ai_rate_limits_client ON public.ai_rate_limits(client_id, requested_at);

ALTER TABLE public.ai_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to ai_cache" ON public.ai_cache FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to ai_rate_limits" ON public.ai_rate_limits FOR ALL USING (true) WITH CHECK (true);
