-- Conversas 2.0 — estado do pipeline automatico de sync/enrich/analise.
--
-- Regra: o cron puxa o que mudou; conversa com inbound novo (lead) puxa
-- mensagens + enriquece midia nova + entra em debounce (analyze_after).
-- ~5 min depois o scheduler dispara ai-analyze-v2. Vendedor (outbound) NAO
-- re-analisa. Espelha o modelo de debounce do 1.0 (stevo-oficial-webhook).

-- ============================================================
-- 1) ghl_conversations: colunas de estado do pipeline.
-- ============================================================
alter table public.ghl_conversations
  add column if not exists messages_synced_until timestamptz,
  add column if not exists analyze_after timestamptz,
  add column if not exists analyze_started_at timestamptz,
  add column if not exists last_analyzed_at timestamptz;

comment on column public.ghl_conversations.messages_synced_until is
  'Maior date_added de mensagem ja espelhada localmente em ghl_messages. Null = nenhuma mensagem sincronizada. Base para detectar inbound novo a puxar.';
comment on column public.ghl_conversations.analyze_after is
  'Quando o debounce de analise vence. Setado ao detectar inbound novo; o scheduler v2 dispara ai-analyze-v2 quando <= now(). Null = nada pendente.';
comment on column public.ghl_conversations.analyze_started_at is
  'Inicio do debounce atual (para o teto/ceiling de 15min, evita esperar pra sempre numa rajada).';
comment on column public.ghl_conversations.last_analyzed_at is
  'Ultima analise concluida. Evita re-analisar o mesmo inbound.';

-- Scheduler v2 varre por analyze_after vencido.
create index if not exists idx_ghl_conv_analyze_due
  on public.ghl_conversations (analyze_after)
  where analyze_after is not null;

-- ============================================================
-- 2) suggestions: caminho 2.0 (referencia ghl_conversations).
-- ============================================================
-- conversation_id (1.0) aponta para public.conversations; aqui adicionamos o
-- vinculo paralelo com ghl_conversations. workspace_id ja existe.
alter table public.suggestions
  add column if not exists ghl_conversation_id uuid
    references public.ghl_conversations(id) on delete set null;

create index if not exists idx_suggestions_ghl_conversation
  on public.suggestions (ghl_conversation_id)
  where ghl_conversation_id is not null;

-- Visibilidade 2.0: vendedor NAO tem login (modelo gestores-only), entao a
-- policy 1.0 (user_id = auth.uid()) nao cobre sugestoes do GHL. Aqui: membro
-- do workspace ou admin ve as sugestoes do seu workspace. As policies 1.0
-- ficam intactas (OR entre policies).
drop policy if exists "Workspace members view ghl suggestions" on public.suggestions;
create policy "Workspace members view ghl suggestions"
  on public.suggestions for select
  using (
    ghl_conversation_id is not null
    and (
      public.has_role(auth.uid(), 'admin')
      or public.is_workspace_member(auth.uid(), workspace_id)
    )
  );
