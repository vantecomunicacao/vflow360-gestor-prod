-- Conversas 2.0: novo modelo onde o GHL e a fonte da verdade.
-- Tabelas novas convivem com as antigas (conversations/messages) ate
-- a fase de cleanup. Sem impacto no fluxo atual da Evolution.
--
-- Modelo de acesso: vflow360 = ferramenta de gestores. Vendedores nao tem
-- login. Qualquer membro do workspace ve TUDO. Filtros por "vendedor
-- responsavel" sao UI-side (queryeiam assigned_ghl_user_id).

-- ============================================================
-- 0) Cleanup de tentativa anterior (user_ghl_links) que existiu
-- brevemente em um draft. Mantido aqui para que esta migration leve
-- qualquer banco ao estado final desejado.
-- ============================================================
drop table if exists public.user_ghl_links cascade;

-- ============================================================
-- 1) ghl_conversations: cache local das conversas do GHL.
-- ============================================================
create table if not exists public.ghl_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ghl_conversation_id text not null,
  ghl_location_id text not null,
  ghl_contact_id text not null,
  contact_name text,
  contact_phone text,
  contact_email text,
  profile_photo_url text,
  channel_type text,
  last_message_at timestamptz,
  last_message_body text,
  last_message_direction text,
  unread_count integer not null default 0,
  assigned_ghl_user_id text,
  ghl_date_added timestamptz,
  ghl_date_updated timestamptz,
  synced_at timestamptz not null default now(),
  unique(workspace_id, ghl_conversation_id)
);

comment on table public.ghl_conversations is
  'Snapshot local das conversas do GHL. Atualizada pelo cron ghl-conversations-sync. assigned_ghl_user_id = GHL assignedTo (apenas display/filtro UI, nao filtra RLS).';

create index if not exists idx_ghl_conv_workspace_assigned
  on public.ghl_conversations (workspace_id, assigned_ghl_user_id);
create index if not exists idx_ghl_conv_workspace_last_msg
  on public.ghl_conversations (workspace_id, last_message_at desc);
create index if not exists idx_ghl_conv_ghl_date_updated
  on public.ghl_conversations (workspace_id, ghl_date_updated desc);

alter table public.ghl_conversations enable row level security;

-- Qualquer membro do workspace ve tudo. Admin global tambem (cobre edge
-- case de admin que nao esteja em workspace_members).
drop policy if exists "Visibility by assignment or admin" on public.ghl_conversations;
drop policy if exists "Workspace members read" on public.ghl_conversations;
create policy "Workspace members read"
  on public.ghl_conversations for select
  using (
    public.has_role(auth.uid(), 'admin')
    or public.is_workspace_member(auth.uid(), workspace_id)
  );

-- Sem policies de INSERT/UPDATE/DELETE: so o service role da edge function
-- de sync escreve, e service role bypassa RLS.

-- ============================================================
-- 2) ghl_messages: cache local das mensagens do GHL.
-- ============================================================
create table if not exists public.ghl_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ghl_conversation_id text not null,
  ghl_message_id text not null,
  direction text not null,
  body text,
  message_type text,
  from_field text,
  to_field text,
  attachments_json jsonb,
  ghl_user_id text,
  date_added timestamptz not null,
  synced_at timestamptz not null default now(),
  unique(workspace_id, ghl_message_id),
  foreign key (workspace_id, ghl_conversation_id)
    references public.ghl_conversations (workspace_id, ghl_conversation_id)
    on delete cascade
);

comment on table public.ghl_messages is
  'Snapshot local das mensagens do GHL. Atualizada pela edge function ghl-messages-sync, geralmente lazy (ao abrir conversa ou antes de analise da IA).';

create index if not exists idx_ghl_msg_conversation
  on public.ghl_messages (workspace_id, ghl_conversation_id, date_added desc);

alter table public.ghl_messages enable row level security;

drop policy if exists "Visibility via parent conversation" on public.ghl_messages;
drop policy if exists "Workspace members read" on public.ghl_messages;
create policy "Workspace members read"
  on public.ghl_messages for select
  using (
    public.has_role(auth.uid(), 'admin')
    or public.is_workspace_member(auth.uid(), workspace_id)
  );

-- ============================================================
-- 3) ghl_sync_watermarks: estado do sync incremental por workspace.
-- ============================================================
create table if not exists public.ghl_sync_watermarks (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  conversations_last_seen_at timestamptz,
  last_run_at timestamptz,
  last_run_status text,
  last_run_error text,
  last_run_count integer
);

comment on table public.ghl_sync_watermarks is
  'Estado do sync incremental do GHL por workspace. conversations_last_seen_at = maior ghl_date_updated visto na ultima rodada (para paginar so o que mudou).';

alter table public.ghl_sync_watermarks enable row level security;

drop policy if exists "Admin reads watermarks" on public.ghl_sync_watermarks;
create policy "Admin reads watermarks"
  on public.ghl_sync_watermarks for select
  using (public.has_role(auth.uid(), 'admin'));
