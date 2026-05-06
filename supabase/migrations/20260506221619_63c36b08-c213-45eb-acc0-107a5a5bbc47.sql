CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id uuid,
  conversation_id uuid,
  provider text NOT NULL,
  model text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_ws_date ON public.ai_usage_log(workspace_id, created_at DESC);
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view ai_usage_log" ON public.ai_usage_log FOR SELECT USING (workspace_id IS NOT NULL AND public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Service role full access ai_usage_log" ON public.ai_usage_log FOR ALL TO service_role USING (true) WITH CHECK (true);