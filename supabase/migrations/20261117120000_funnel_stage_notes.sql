-- Observações por etapa do funil, configuradas por funil (pipeline).
-- Formato: { "<pipeline ghl_id>": { "<bucket key>": "texto" } }
-- O dashboard mostra a observação só quando exatamente um funil está selecionado.
ALTER TABLE public.ghl_dashboard_settings
  ADD COLUMN IF NOT EXISTS funnel_stage_notes jsonb NOT NULL DEFAULT '{}'::jsonb;
