-- Soft-delete de oportunidades que sumiram do GHL.
-- Causa raiz: ghl-sync fazia apenas upsert de /opportunities/search e nunca
-- removia registros deletados no GHL. Eles ficavam "congelados" no último
-- estado (ex.: abertos em Recuperação) e inflavam leads-esfriando, contagem de
-- abertas e métricas do dashboard.
--
-- A reconciliação na ghl-sync marca deleted_at = now() nas oportunidades não
-- vistas numa rodada COMPLETA (nunca em sync truncada pelo cap de páginas).
-- Se a oportunidade reaparecer no GHL, o upsert zera deleted_at (revival).

alter table public.ghl_opportunities
  add column if not exists deleted_at timestamptz;

-- Índice parcial: as métricas filtram deleted_at IS NULL por workspace/funil.
create index if not exists idx_ghl_opportunities_active
  on public.ghl_opportunities (workspace_id, pipeline_id)
  where deleted_at is null;

comment on column public.ghl_opportunities.deleted_at is
  'Marcado pela ghl-sync quando a oportunidade some de uma rodada COMPLETA do GHL (soft-delete). NULL = ativa. Upsert de reaparecimento zera este campo.';
