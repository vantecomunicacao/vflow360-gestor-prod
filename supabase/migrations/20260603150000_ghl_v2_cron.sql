-- Conversas 2.0 — crons do pipeline automatico.
--
-- Padrao postgres->edge (net.http_post com anon key), NUNCA edge->edge.
--   * trigger_ghl_v2_sync_all  (a cada 10 min): por workspace com GHL conectado,
--     chama ghl-conversations-sync (que faz lista + heat + enrich inline).
--   * trigger_ghl_v2_analyze_due (a cada 2 min): reivindica conversas com
--     analyze_after vencido (limpa atomicamente) e chama ai-analyze-v2 por conversa.
--
-- anon key e URL do projeto xcrfbpyhyznyufijrdry (mesmo padrao das migrations
-- 20260521140000 e 20260602130000).

-- ============================================================
-- 1) Sync tick: lista + heat + enrich por workspace.
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_ghl_v2_sync_all()
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
    SELECT DISTINCT workspace_id
    FROM public.integrations
    WHERE type = 'ghl' AND status = 'connected' AND workspace_id IS NOT NULL
  LOOP
    -- jitter pequeno para espalhar carga na API do GHL
    PERFORM pg_sleep(floor(random() * 10 + 1)::int);

    PERFORM net.http_post(
      url := 'https://xcrfbpyhyznyufijrdry.supabase.co/functions/v1/ghl-conversations-sync',
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
-- 2) Analyze tick: drena conversas com debounce vencido.
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_ghl_v2_analyze_due()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  conv record;
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcmZicHloeXpueXVmaWpyZHJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMTc0NDAsImV4cCI6MjA5NDg5MzQ0MH0._6Oe1CSLsxUgI6PlffPAoqYJYPKSMEApDyNergx0yYg';
BEGIN
  -- Reivindica atomicamente (limpa analyze_after) para evitar disparo duplo
  -- entre ticks. ai-analyze-v2 marca last_analyzed_at ao concluir.
  FOR conv IN
    UPDATE public.ghl_conversations
       SET analyze_after = NULL
     WHERE id IN (
       SELECT id FROM public.ghl_conversations
        WHERE analyze_after IS NOT NULL AND analyze_after <= now()
        ORDER BY analyze_after ASC
        LIMIT 50
     )
    RETURNING workspace_id, ghl_conversation_id
  LOOP
    PERFORM net.http_post(
      url := 'https://xcrfbpyhyznyufijrdry.supabase.co/functions/v1/ai-analyze-v2',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key,
        'apikey', anon_key
      ),
      body := jsonb_build_object(
        'workspace_id', conv.workspace_id,
        'ghl_conversation_id', conv.ghl_conversation_id
      ),
      timeout_milliseconds := 60000
    );
  END LOOP;
END;
$function$;

-- ============================================================
-- 3) Agendamentos (recria se ja existirem).
-- ============================================================
SELECT cron.unschedule('ghl-v2-sync-tick')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ghl-v2-sync-tick');
SELECT cron.schedule(
  'ghl-v2-sync-tick',
  '*/10 * * * *',
  $tick$ SELECT public.trigger_ghl_v2_sync_all(); $tick$
);

SELECT cron.unschedule('ghl-v2-analyze-tick')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ghl-v2-analyze-tick');
SELECT cron.schedule(
  'ghl-v2-analyze-tick',
  '*/2 * * * *',
  $tick$ SELECT public.trigger_ghl_v2_analyze_due(); $tick$
);
