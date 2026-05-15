ALTER TABLE public.ghl_dashboard_settings
ADD COLUMN IF NOT EXISTS ai_allowed_pipeline_ids text[] NOT NULL DEFAULT '{}'::text[];