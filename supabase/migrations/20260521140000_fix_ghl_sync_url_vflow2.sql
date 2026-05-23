-- Corrige trigger_ghl_sync_all para o projeto VFlow-2.0 (xcrfbpyhyznyufijrdry).
-- A versao anterior (20260514) tinha a URL e a anon key do projeto ANTIGO
-- (uikrpvucauamkhxxsvyb) hardcoded, fazendo o auto-sync do GHL bater no projeto errado.
CREATE OR REPLACE FUNCTION public.trigger_ghl_sync_all()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ws record;
  jitter_seconds integer;
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcmZicHloeXpueXVmaWpyZHJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMTc0NDAsImV4cCI6MjA5NDg5MzQ0MH0._6Oe1CSLsxUgI6PlffPAoqYJYPKSMEApDyNergx0yYg';
BEGIN
  FOR ws IN
    SELECT DISTINCT workspace_id
    FROM public.integrations
    WHERE type = 'ghl' AND status = 'connected' AND workspace_id IS NOT NULL
  LOOP
    jitter_seconds := floor(random() * 31 + 30)::int;

    PERFORM pg_sleep(jitter_seconds);

    PERFORM net.http_post(
      url := 'https://xcrfbpyhyznyufijrdry.supabase.co/functions/v1/ghl-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key,
        'apikey', anon_key
      ),
      body := jsonb_build_object('workspace_id', ws.workspace_id, 'cron', true),
      timeout_milliseconds := 60000
    );
  END LOOP;
END;
$function$;
