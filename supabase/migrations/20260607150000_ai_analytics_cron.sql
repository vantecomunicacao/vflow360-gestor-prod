-- Cerebro analitico (Fase 1) — crons do pipeline diario.
--
-- Padrao postgres->edge (net.http_post com anon key), NUNCA edge->edge.
--   * trigger_ai_snapshot_all (03:00): por workspace nao deletado, grava o
--     snapshot diario das metricas (ai-snapshot, deterministico).
--   * trigger_ai_insights_all (03:30): por workspace com IA habilitada, gera os
--     insights proativos (ai-insights-generate). Roda DEPOIS do snapshot.
--
-- anon key e URL do projeto xcrfbpyhyznyufijrdry (mesmo padrao das migrations
-- 20260603150000 e 20260602130000).

-- ============================================================
-- 1) Snapshot tick: retrato diario por workspace.
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_ai_snapshot_all()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ws record;
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcmZicHloeXpueXVmaWpyZHJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMTc0NDAsImV4cCI6MjA5NDg5MzQ0MH0._6Oe1CSLsxUgI6PlffPAoqYJYPKSMEApDyNergx0yYg';
BEGIN
  FOR ws IN
    SELECT id AS workspace_id
    FROM public.workspaces
    WHERE deleted_at IS NULL
  LOOP
    PERFORM net.http_post(
      url := 'https://xcrfbpyhyznyufijrdry.supabase.co/functions/v1/ai-snapshot',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key,
        'apikey', anon_key
      ),
      body := jsonb_build_object('workspace_id', ws.workspace_id, 'cron', true),
      timeout_milliseconds := 120000
    );
  END LOOP;
END;
$function$;

-- ============================================================
-- 2) Insights tick: gera insights proativos (IA) por workspace habilitado.
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_ai_insights_all()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ws record;
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcmZicHloeXpueXVmaWpyZHJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMTc0NDAsImV4cCI6MjA5NDg5MzQ0MH0._6Oe1CSLsxUgI6PlffPAoqYJYPKSMEApDyNergx0yYg';
BEGIN
  FOR ws IN
    SELECT id AS workspace_id
    FROM public.workspaces
    WHERE deleted_at IS NULL AND ai_analysis_enabled = true
  LOOP
    PERFORM net.http_post(
      url := 'https://xcrfbpyhyznyufijrdry.supabase.co/functions/v1/ai-insights-generate',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key,
        'apikey', anon_key
      ),
      body := jsonb_build_object('workspace_id', ws.workspace_id, 'cron', true),
      timeout_milliseconds := 120000
    );
  END LOOP;
END;
$function$;

-- ============================================================
-- 3) Agendamentos (recria se ja existirem).
-- ============================================================
SELECT cron.unschedule('ai-snapshot-tick')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-snapshot-tick');
SELECT cron.schedule(
  'ai-snapshot-tick',
  '0 6 * * *',  -- 06:00 UTC = 03:00 America/Sao_Paulo
  $tick$ SELECT public.trigger_ai_snapshot_all(); $tick$
);

SELECT cron.unschedule('ai-insights-tick')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-insights-tick');
SELECT cron.schedule(
  'ai-insights-tick',
  '30 6 * * *',  -- 06:30 UTC = 03:30 America/Sao_Paulo (apos o snapshot)
  $tick$ SELECT public.trigger_ai_insights_all(); $tick$
);
