CREATE TABLE public.system_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level TEXT NOT NULL CHECK (level IN ('error','warning','info')),
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  workspace_id UUID,
  user_id UUID,
  url TEXT,
  user_agent TEXT,
  env TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_logs_created_at ON public.system_logs (created_at DESC);
CREATE INDEX idx_system_logs_level ON public.system_logs (level);
CREATE INDEX idx_system_logs_source ON public.system_logs (source);
CREATE INDEX idx_system_logs_workspace ON public.system_logs (workspace_id);

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view system_logs"
  ON public.system_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete system_logs"
  ON public.system_logs FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access system_logs"
  ON public.system_logs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Retenção 30 dias
CREATE OR REPLACE FUNCTION public.cleanup_old_system_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.system_logs WHERE created_at < now() - INTERVAL '30 days';
END;
$$;

SELECT cron.schedule(
  'cleanup-system-logs-daily',
  '0 3 * * *',
  $$ SELECT public.cleanup_old_system_logs(); $$
);