-- attributionSource nativo do GHL no contato (sessionSource/medium): "fonte
-- verdadeira" do lead quando não há UTM nem source. Ex: {"sessionSource":"CRM UI","medium":"manual"}.
ALTER TABLE public.ghl_contacts ADD COLUMN IF NOT EXISTS attribution_source jsonb;
