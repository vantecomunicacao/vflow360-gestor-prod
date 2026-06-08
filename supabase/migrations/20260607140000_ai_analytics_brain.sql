-- Cerebro analitico (Fase 1): memoria de periodos + insights proativos.
--
-- Contexto: hoje a IA so olha UMA conversa por vez e sugere acoes de CRM
-- (ai-analyze-v2 -> suggestions). Esta migration cria a base de um ANALISTA que
-- olha o CONJUNTO: snapshots diarios das metricas (para comparar periodo a
-- periodo, ja que o GHL e fonte viva e nao guarda historico) e uma fila de
-- insights gerados pela IA, exibidos no card "Insights com I.A." do Dashboard.
--
-- Escrita: feita por edge functions com service role (bypassa RLS).
-- Leitura: gestor/admin (analytics e visao de gestao). Vendedor (membro COM
-- linha em user_ghl_links) NAO ve — mesmo escopo do dashboard.

-- ============================================================
-- 1) analytics_snapshots: retrato comparavel do funil por dia.
-- ============================================================
create table if not exists public.analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  period_date date not null,
  granularity text not null default 'daily',
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_id, period_date, granularity)
);

comment on table public.analytics_snapshots is
  'Memoria do cerebro analitico: agregado diario das metricas do funil por workspace, congelado para permitir comparacao entre periodos (o GHL nao guarda historico). Gravado por ai-snapshot.';

create index if not exists idx_analytics_snapshots_ws_date
  on public.analytics_snapshots (workspace_id, period_date desc);

alter table public.analytics_snapshots enable row level security;

drop policy if exists "Managers read snapshots" on public.analytics_snapshots;
create policy "Managers read snapshots"
  on public.analytics_snapshots for select
  using (
    public.has_role(auth.uid(), 'admin')
    or (
      public.is_workspace_member(auth.uid(), workspace_id)
      and not exists (
        select 1 from public.user_ghl_links l
        where l.user_id = auth.uid()
          and l.workspace_id = public.analytics_snapshots.workspace_id
      )
    )
  );

-- ============================================================
-- 2) ai_insights: saida proativa da IA (gargalos/tendencias/etc).
-- ============================================================
create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('gargalo','tendencia','oportunidade','alerta')),
  title text not null,
  body text not null,
  severity text not null default 'info' check (severity in ('info','warn','high')),
  period_label text,
  refs jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','dismissed')),
  prompt_version text,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz
);

comment on table public.ai_insights is
  'Insights proativos gerados por ai-insights-generate a partir dos snapshots + amostra de conversas. Exibidos no card do Dashboard; gestor pode dispensar (status=dismissed). prompt_version garante rastreabilidade (AI_DECISIONS #2).';

create index if not exists idx_ai_insights_ws_status
  on public.ai_insights (workspace_id, status, created_at desc);

alter table public.ai_insights enable row level security;

drop policy if exists "Managers read insights" on public.ai_insights;
create policy "Managers read insights"
  on public.ai_insights for select
  using (
    public.has_role(auth.uid(), 'admin')
    or (
      public.is_workspace_member(auth.uid(), workspace_id)
      and not exists (
        select 1 from public.user_ghl_links l
        where l.user_id = auth.uid()
          and l.workspace_id = public.ai_insights.workspace_id
      )
    )
  );

-- Gestor pode dispensar (UPDATE de status). Geracao e via service role.
drop policy if exists "Managers update insights" on public.ai_insights;
create policy "Managers update insights"
  on public.ai_insights for update
  using (
    public.has_role(auth.uid(), 'admin')
    or (
      public.is_workspace_member(auth.uid(), workspace_id)
      and not exists (
        select 1 from public.user_ghl_links l
        where l.user_id = auth.uid()
          and l.workspace_id = public.ai_insights.workspace_id
      )
    )
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or (
      public.is_workspace_member(auth.uid(), workspace_id)
      and not exists (
        select 1 from public.user_ghl_links l
        where l.user_id = auth.uid()
          and l.workspace_id = public.ai_insights.workspace_id
      )
    )
  );
