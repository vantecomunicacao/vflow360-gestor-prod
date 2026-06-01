-- Move anon_key e URL hardcoded de trigger_ghl_sync_all para configurações de
-- banco (app.settings.*), facilitando rotação sem nova migration.
--
-- Pré-requisito: rodar uma vez por ambiente (Dashboard Supabase > SQL editor),
-- substituindo os valores conforme o projeto:
--
--   ALTER DATABASE postgres SET app.settings.supabase_url   = 'https://<ref>.supabase.co';
--   ALTER DATABASE postgres SET app.settings.supabase_anon_key = '<anon_key>';
--
-- Enquanto o setting não estiver definido, a função usa o fallback hardcoded
-- (mesmo valor da migration anterior 20260521140000), garantindo
-- compatibilidade durante a janela de configuração.

CREATE OR REPLACE FUNCTION public.trigger_ghl_sync_all()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ws record;
  jitter_seconds integer;
  fallback_url text := 'https://xcrfbpyhyznyufijrdry.supabase.co';
  fallback_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcmZicHloeXpueXVmaWpyZHJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMTc0NDAsImV4cCI6MjA5NDg5MzQ0MH0._6Oe1CSLsxUgI6PlffPAoqYJYPKSMEApDyNergx0yYg';
  base_url text;
  anon_key text;
BEGIN
  base_url := coalesce(nullif(current_setting('app.settings.supabase_url', true), ''), fallback_url);
  anon_key := coalesce(nullif(current_setting('app.settings.supabase_anon_key', true), ''), fallback_key);

  FOR ws IN
    SELECT DISTINCT workspace_id
    FROM public.integrations
    WHERE type = 'ghl' AND status = 'connected' AND workspace_id IS NOT NULL
  LOOP
    jitter_seconds := floor(random() * 31 + 30)::int;

    PERFORM pg_sleep(jitter_seconds);

    PERFORM net.http_post(
      url := base_url || '/functions/v1/ghl-sync',
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
