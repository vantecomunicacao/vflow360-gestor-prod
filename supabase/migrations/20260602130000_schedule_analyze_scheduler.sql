-- Agenda a edge function analyze-scheduler para rodar a cada minuto.
-- Sem este cron, conversas debounçadas pelos webhooks do Stevo (que apenas
-- gravam analyze_after no banco) nunca disparam a analise automatica.
-- Para o Evolution, serve como rede de seguranca caso o fetch direto
-- (fire-and-forget no webhook) caia antes de completar.

-- Remove agendamento antigo (se existir) antes de recriar
select cron.unschedule('analyze-scheduler-tick')
  where exists (select 1 from cron.job where jobname = 'analyze-scheduler-tick');

select cron.schedule(
  'analyze-scheduler-tick',
  '* * * * *',
  $tick$
    select net.http_post(
      url := 'https://xcrfbpyhyznyufijrdry.supabase.co/functions/v1/analyze-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcmZicHloeXpueXVmaWpyZHJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMTc0NDAsImV4cCI6MjA5NDg5MzQ0MH0._6Oe1CSLsxUgI6PlffPAoqYJYPKSMEApDyNergx0yYg',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcmZicHloeXpueXVmaWpyZHJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMTc0NDAsImV4cCI6MjA5NDg5MzQ0MH0._6Oe1CSLsxUgI6PlffPAoqYJYPKSMEApDyNergx0yYg'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $tick$
);
