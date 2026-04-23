ALTER TABLE public.ghl_dashboard_settings
ADD COLUMN IF NOT EXISTS business_hours_start text NOT NULL DEFAULT '09:00',
ADD COLUMN IF NOT EXISTS business_hours_end text NOT NULL DEFAULT '18:00';