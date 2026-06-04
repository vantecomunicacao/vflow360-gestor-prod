-- Conversas 2.0: adiciona enriched_body para anexos descritos pela IA.
--
-- Mensagens com attachments_json (imagem, audio, PDF) recebem aqui o texto
-- descritivo gerado pelo ghl-enrich-attachments (vision/whisper/pdf-extract).
-- A IA do ai-analyze-v2 le `coalesce(enriched_body, body)` para entender
-- midia sem ter que processar de novo.

alter table public.ghl_messages
  add column if not exists enriched_body text,
  add column if not exists enriched_at timestamptz,
  add column if not exists enrich_error text;

comment on column public.ghl_messages.enriched_body is
  'Descricao/transcricao gerada para attachments (imagem -> vision, audio -> whisper, PDF -> texto). Null = ainda nao enriquecido OU sem anexo. ai-analyze deve usar coalesce(enriched_body, body).';
comment on column public.ghl_messages.enriched_at is
  'Quando enriched_body foi gerado. Permite reprocessamento se o modelo mudar.';
comment on column public.ghl_messages.enrich_error is
  'Ultimo erro de enriquecimento (ex: 404 no Stevo, sem API key). Null se ok ou nao tentou.';

-- Indice parcial para o worker achar pendentes rapido.
create index if not exists idx_ghl_msg_pending_enrich
  on public.ghl_messages (workspace_id, ghl_conversation_id)
  where attachments_json is not null and enriched_body is null and enrich_error is null;
