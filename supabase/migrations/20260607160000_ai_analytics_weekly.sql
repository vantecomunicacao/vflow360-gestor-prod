-- Cerebro analitico — passa de diario para SEMANAL.
--
-- Motivo: analise comercial diaria e ruido; vendas se le por semana. Alem disso,
-- 1 chamada LLM/semana (em vez de /dia) corta custo. O snapshot tambem vira
-- semanal, assim a comparacao entre os dois snapshots mais recentes = semana
-- atual vs. semana anterior (week-over-week), que e o que o insight usa.
--
-- Roda na segunda de manha (BRT): snapshot 03:00, insights 03:30.
-- As funcoes trigger_ai_snapshot_all / trigger_ai_insights_all permanecem as
-- mesmas (definidas em 20260607150000); aqui so trocamos o agendamento.

SELECT cron.unschedule('ai-snapshot-tick')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-snapshot-tick');
SELECT cron.schedule(
  'ai-snapshot-tick',
  '0 6 * * 1',   -- segunda 06:00 UTC = 03:00 America/Sao_Paulo
  $tick$ SELECT public.trigger_ai_snapshot_all(); $tick$
);

SELECT cron.unschedule('ai-insights-tick')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-insights-tick');
SELECT cron.schedule(
  'ai-insights-tick',
  '30 6 * * 1',  -- segunda 06:30 UTC = 03:30 America/Sao_Paulo (apos o snapshot)
  $tick$ SELECT public.trigger_ai_insights_all(); $tick$
);
