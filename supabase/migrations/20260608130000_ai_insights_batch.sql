-- Analista IA — "lote" (batch) + período da análise no card.
--
-- Motivo: a geração marcava os insights ativos anteriores como dismissed para
-- limpar a fila — o que misturava "substituído pela nova semana" com "o gestor
-- dispensou", impedindo restaurar. Agora cada execução vira um LOTE; o card mostra
-- só o lote mais recente, e dispensar/restaurar opera dentro do lote.
--
-- period_start/period_end: janela analisada (semana), exibida no cabeçalho do card
-- (ex.: "01 a 07/06/26").

alter table public.ai_insights
  add column if not exists batch_id uuid,
  add column if not exists period_start date,
  add column if not exists period_end date;

comment on column public.ai_insights.batch_id is
  'Identifica a execução (lote) que gerou estes insights. O card exibe só o lote mais recente; dispensar/restaurar opera dentro do lote.';

create index if not exists idx_ai_insights_ws_created
  on public.ai_insights (workspace_id, created_at desc);
