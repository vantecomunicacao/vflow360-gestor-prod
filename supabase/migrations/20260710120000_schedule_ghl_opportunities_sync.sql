-- Agenda a sync DIÁRIA de oportunidades para todas as contas GHL conectadas.
--
-- Causa: ghl-sync (opportunities) só era disparado pelo frontend ao abrir o
-- dashboard de uma conta. Contas não visualizadas (ex.: Tanques União ficou 4
-- dias) não sincronizavam — oportunidades, leads-esfriando e insights ficavam
-- congelados. A função trigger_ghl_sync_all() já existia mas nunca fora agendada.
--
-- 04:00 evita colisão com os jobs de 03:00-03:10. A sync de conversas
-- (trigger_ghl_v2_sync_all, job a cada 10 min) permanece inalterada.

select cron.unschedule('ghl-opportunities-sync-daily')
where exists (select 1 from cron.job where jobname = 'ghl-opportunities-sync-daily');

select cron.schedule(
  'ghl-opportunities-sync-daily',
  '0 4 * * *',
  $$ SELECT public.trigger_ghl_sync_all(); $$
);
