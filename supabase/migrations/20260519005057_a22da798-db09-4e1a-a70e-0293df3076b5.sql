ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS ghl_user_id text;

CREATE INDEX IF NOT EXISTS idx_conversations_ghl_user_id
  ON public.conversations(ghl_user_id)
  WHERE ghl_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_ws_integration_label
  ON public.conversations(workspace_id, integration_label)
  WHERE integration_label IS NOT NULL;

-- Backfill: derive ghl_user_id from integrations.config (matching workspace + label)
UPDATE public.conversations c
SET ghl_user_id = (i.config->>'ghl_user_id')
FROM public.integrations i
WHERE c.ghl_user_id IS NULL
  AND c.workspace_id = i.workspace_id
  AND c.integration_label IS NOT NULL
  AND (i.config->>'label') = c.integration_label
  AND (i.config->>'ghl_user_id') IS NOT NULL
  AND i.type IN ('whatsapp_uazap','whatsapp_stevo','whatsapp_stevo_oficial');