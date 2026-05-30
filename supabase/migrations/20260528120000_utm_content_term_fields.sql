-- UTM tracking (extensão): adiciona utm_content e utm_term para mapeamento futuro.
-- Mesmo padrão das colunas utm_source/medium/campaign — guardam ghl_id (ou field_key).
ALTER TABLE public.ghl_dashboard_settings
  ADD COLUMN IF NOT EXISTS utm_content_field_id text,
  ADD COLUMN IF NOT EXISTS utm_term_field_id    text;
