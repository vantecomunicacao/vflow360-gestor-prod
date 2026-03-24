-- Allow service role to insert suggestions (edge function uses service role)
CREATE POLICY "Service role can insert suggestions"
ON public.suggestions
FOR INSERT
TO service_role
WITH CHECK (true);

-- Create ai_config table for per-user AI action settings
CREATE TABLE public.ai_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  auto_approve boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, action_type)
);

ALTER TABLE public.ai_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai_config" ON public.ai_config FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ai_config" ON public.ai_config FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ai_config" ON public.ai_config FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access ai_config" ON public.ai_config FOR ALL TO service_role USING (true) WITH CHECK (true);