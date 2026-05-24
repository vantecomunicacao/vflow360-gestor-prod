-- UTM tracking: permite mapear quais custom fields do GHL correspondem aos UTMs.
-- Cada coluna guarda o ghl_id (ou field_key) do custom field — segue o mesmo padrão
-- de origin_field_name e additional_date_field.
ALTER TABLE public.ghl_dashboard_settings
  ADD COLUMN IF NOT EXISTS utm_source_field_id   text,
  ADD COLUMN IF NOT EXISTS utm_medium_field_id   text,
  ADD COLUMN IF NOT EXISTS utm_campaign_field_id text;
