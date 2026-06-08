-- Analista IA — config por workspace e remocao da "foto" (snapshot).
--
-- Decisao (07-08/06): largar o snapshot. A memoria do cerebro passa a ser a
-- camada de analise AO VIVO (consulta ghl_opportunities por periodo) + os
-- insights guardados em ai_insights. Comparacao semana atual vs. anterior e
-- feita na hora, sem congelar estado.
--
-- Config do Analista (por workspace) fica em ghl_dashboard_settings.ai_insights_config:
--   {
--     "enabled": bool,                         -- liga/desliga o Analista
--     "combined": { "prompt": "" },            -- prompt da visao combinada ("" = padrao)
--     "pipelines": [                           -- funis acompanhados (presenca = selecionado)
--       { "id": "<ghl_pipeline_id>", "prompt": "" }   -- "" = prompt padrao
--     ]
--   }
-- Cada funil tem foco proprio (ex: "agendamento de reuniao" x "visita na loja").
-- A visao combinada e VOLUME/VALOR dos funis marcados — nunca conversao misturada.

-- 1) Config do Analista
alter table public.ghl_dashboard_settings
  add column if not exists ai_insights_config jsonb not null default '{}'::jsonb;

comment on column public.ghl_dashboard_settings.ai_insights_config is
  'Config do Analista IA: { enabled, combined:{prompt}, pipelines:[{id,prompt}] }. prompt "" = usa o padrao embutido na edge ai-insights-generate.';

-- 2) Remove a foto: cron + trigger + tabela.
SELECT cron.unschedule('ai-snapshot-tick')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-snapshot-tick');

DROP FUNCTION IF EXISTS public.trigger_ai_snapshot_all();

DROP TABLE IF EXISTS public.analytics_snapshots;

-- O cron ai-insights-tick (semanal) permanece; a function ai-insights-generate
-- foi reescrita para analisar ao vivo por periodo. trigger_ai_insights_all so
-- precisa disparar por workspace (o gate de enabled agora e por config, dentro
-- da function), entao mantemos a definicao existente.
