-- Segundo campo de data adicional no dashboard.
-- Permite configurar dois filtros de período extras (ex: "Data de Venda" e
-- "Data de Entrega") além do período principal (ghl_created_at).
ALTER TABLE public.ghl_dashboard_settings
  ADD COLUMN IF NOT EXISTS additional_date_field_2 text;
