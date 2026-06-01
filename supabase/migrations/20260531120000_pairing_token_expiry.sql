-- Pairing tokens: adiciona expiração e limite de usos.
-- Aditivo e compatível: tokens existentes (expires_at IS NULL) continuam válidos
-- indefinidamente, evitando invalidar links em produção; novos tokens criados
-- pela edge function evolution-manage passam a usar expires_at/max_uses.

alter table public.integration_pairing_tokens
  add column if not exists expires_at timestamptz,
  add column if not exists max_uses integer;

-- Acelera o lookup do "token ativo" usado em get_or_create_pairing_link
-- e na validação em evolution-pairing-public.
create index if not exists idx_ipt_integration_active
  on public.integration_pairing_tokens(integration_id)
  where revoked_at is null;
