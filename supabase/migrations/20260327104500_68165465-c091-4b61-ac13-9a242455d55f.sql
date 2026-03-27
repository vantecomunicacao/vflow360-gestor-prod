
CREATE TABLE public.ai_provider_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'lovable',
  api_key text,
  model text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.ai_provider_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai_provider_config" ON public.ai_provider_config
  FOR SELECT TO public USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai_provider_config" ON public.ai_provider_config
  FOR INSERT TO public WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ai_provider_config" ON public.ai_provider_config
  FOR UPDATE TO public USING (auth.uid() = user_id);

CREATE POLICY "Service role full access ai_provider_config" ON public.ai_provider_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_ai_provider_config_updated_at
  BEFORE UPDATE ON public.ai_provider_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
