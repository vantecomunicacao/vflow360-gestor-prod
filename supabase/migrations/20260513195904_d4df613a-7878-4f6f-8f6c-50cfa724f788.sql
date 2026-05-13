
CREATE OR REPLACE FUNCTION public.trigger_ghl_sync_all()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ws record;
  idx integer := 0;
  jitter_seconds integer;
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpa3JwdnVjYXVhbWtoeHhzdnliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzgzMzQsImV4cCI6MjA4OTg1NDMzNH0.wjY9R1APb-7Cnc44dNXkoKo6ZjSVDe1bjV1-R6Ri6V8';
BEGIN
  FOR ws IN
    SELECT DISTINCT workspace_id
    FROM public.integrations
    WHERE type = 'ghl' AND status = 'connected' AND workspace_id IS NOT NULL
  LOOP
    idx := idx + 1;
    jitter_seconds := 30 + ((idx - 1) * 30);
    IF jitter_seconds > 180 THEN
      jitter_seconds := 180;
    END IF;

    PERFORM pg_sleep(jitter_seconds);

    PERFORM net.http_post(
      url := 'https://uikrpvucauamkhxxsvyb.supabase.co/functions/v1/ghl-sync',
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
