ALTER TABLE public.ghl_dashboard_settings
ADD COLUMN IF NOT EXISTS chart_custom_fields text[] NOT NULL DEFAULT '{}'::text[];