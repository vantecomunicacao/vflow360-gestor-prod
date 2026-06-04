-- Conversas 2.0 — marco de corte do enriquecimento por conta.
--
-- Regra: midia ANTERIOR ao corte (historico no momento que a conta entrou no
-- 2.0) nunca e tratada com IA — continua visivel na thread, mas sem
-- transcricao/descricao automatica. So midia a partir do corte e enriquecida.
-- Corte = momento do primeiro sync da conta (setado pelo ghl-conversations-sync).

alter table public.ghl_sync_watermarks
  add column if not exists enrich_cutoff_at timestamptz;

comment on column public.ghl_sync_watermarks.enrich_cutoff_at is
  'Marco de corte do enriquecimento. Mensagens com date_added < este valor nunca sao enriquecidas (historico anterior a entrada no 2.0). Setado uma vez no primeiro sync.';

-- Contas existentes: corte = agora. O que ja foi enriquecido permanece; daqui
-- pra frente so se trata midia nova. Nao mexe em enriched_body existente.
update public.ghl_sync_watermarks
  set enrich_cutoff_at = now()
  where enrich_cutoff_at is null;
