-- Login do vendedor (Conversas 2.0): vinculo user<->GHL e escopo por atribuicao.
--
-- Contexto: a tabela user_ghl_links foi projetada mas NUNCA aplicada no banco
-- (a decisao anterior era "vendedor ve tudo"). O usuario reverteu em 2026-06-05:
-- vendedor agora loga e ve SOMENTE as sugestoes das conversas atribuidas a ele.
--
-- Vendedor = usuario nao-admin, membro do workspace, COM linha em user_ghl_links.
-- A presenca do link o marca e o escopa. Gestor (membro SEM link) e admin veem tudo.

-- ============================================================
-- 0) user_ghl_links: mapeia user vflow360 -> ghl_user_id por workspace (1:1).
-- ============================================================
create table if not exists public.user_ghl_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ghl_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, workspace_id)
);

comment on table public.user_ghl_links is
  'Mapeamento 1:1 entre um usuario do vflow360 (vendedor) e um usuario do GHL dentro de um workspace. Determina quais conversas/sugestoes o vendedor ve em Conversas 2.0.';

create index if not exists idx_user_ghl_links_workspace_ghl
  on public.user_ghl_links (workspace_id, ghl_user_id);

alter table public.user_ghl_links enable row level security;

drop policy if exists "Users see their own link" on public.user_ghl_links;
create policy "Users see their own link"
  on public.user_ghl_links for select
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins manage links" on public.user_ghl_links;
create policy "Admins manage links"
  on public.user_ghl_links for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 1) ghl_conversations: gestor/admin veem tudo; vendedor (com link) so as dele.
-- ============================================================
drop policy if exists "Workspace members read" on public.ghl_conversations;
create policy "Workspace members read"
  on public.ghl_conversations for select
  using (
    public.has_role(auth.uid(), 'admin')
    or (
      public.is_workspace_member(auth.uid(), workspace_id)
      and not exists (
        select 1 from public.user_ghl_links l
        where l.user_id = auth.uid()
          and l.workspace_id = public.ghl_conversations.workspace_id
      )
    )
  );

drop policy if exists "Vendor views assigned conversations" on public.ghl_conversations;
create policy "Vendor views assigned conversations"
  on public.ghl_conversations for select
  using (
    exists (
      select 1 from public.user_ghl_links l
      where l.user_id = auth.uid()
        and l.workspace_id = public.ghl_conversations.workspace_id
        and l.ghl_user_id = public.ghl_conversations.assigned_ghl_user_id
    )
  );

-- ============================================================
-- 2) suggestions SELECT amplo (gestor/admin) — exclui o vendedor.
-- ============================================================
drop policy if exists "Workspace members view ghl suggestions" on public.suggestions;
create policy "Workspace members view ghl suggestions"
  on public.suggestions for select
  using (
    ghl_conversation_id is not null
    and (
      public.has_role(auth.uid(), 'admin')
      or (
        public.is_workspace_member(auth.uid(), workspace_id)
        and not exists (
          select 1 from public.user_ghl_links l
          where l.user_id = auth.uid()
            and l.workspace_id = public.suggestions.workspace_id
        )
      )
    )
  );

-- ============================================================
-- 3) suggestions: vendedor ve e atualiza (aceitar/rejeitar) so as dele.
-- (Aprovar executa via ghl-manage com service role; rejeitar e update
-- client-side -> precisa da policy de UPDATE. Policies 1.0 ficam intactas.)
-- ============================================================
drop policy if exists "Vendor views assigned ghl suggestions" on public.suggestions;
create policy "Vendor views assigned ghl suggestions"
  on public.suggestions for select
  using (
    ghl_conversation_id is not null
    and exists (
      select 1
      from public.user_ghl_links l
      join public.ghl_conversations c
        on c.id = public.suggestions.ghl_conversation_id
      where l.user_id = auth.uid()
        and l.workspace_id = public.suggestions.workspace_id
        and l.ghl_user_id = c.assigned_ghl_user_id
    )
  );

drop policy if exists "Vendor updates assigned ghl suggestions" on public.suggestions;
create policy "Vendor updates assigned ghl suggestions"
  on public.suggestions for update
  using (
    ghl_conversation_id is not null
    and exists (
      select 1
      from public.user_ghl_links l
      join public.ghl_conversations c
        on c.id = public.suggestions.ghl_conversation_id
      where l.user_id = auth.uid()
        and l.workspace_id = public.suggestions.workspace_id
        and l.ghl_user_id = c.assigned_ghl_user_id
    )
  )
  with check (
    ghl_conversation_id is not null
    and exists (
      select 1
      from public.user_ghl_links l
      join public.ghl_conversations c
        on c.id = public.suggestions.ghl_conversation_id
      where l.user_id = auth.uid()
        and l.workspace_id = public.suggestions.workspace_id
        and l.ghl_user_id = c.assigned_ghl_user_id
    )
  );
