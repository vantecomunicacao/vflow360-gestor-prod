-- Tokens de pareamento de WhatsApp (Evolution API) reutilizáveis.
-- O operador gera um link permanente por integração e envia ao cliente final;
-- o cliente abre o link sempre que precisar reconectar o WhatsApp, sem login.

create table public.integration_pairing_tokens (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.integrations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  token_prefix text not null,
  revoked_at timestamptz,
  last_paired_at timestamptz,
  last_seen_at timestamptz,
  use_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ipt_integration on public.integration_pairing_tokens(integration_id);
create index idx_ipt_workspace_active on public.integration_pairing_tokens(workspace_id)
  where revoked_at is null;

create trigger update_ipt_updated_at
before update on public.integration_pairing_tokens
for each row execute function public.update_updated_at_column();

alter table public.integration_pairing_tokens enable row level security;

-- Membros do workspace podem ver tokens da sua workspace.
create policy "Members view pairing tokens"
  on public.integration_pairing_tokens for select
  using (public.is_workspace_member(auth.uid(), workspace_id));

-- Membros podem revogar (UPDATE) — não há INSERT/DELETE para usuários autenticados:
-- criação passa obrigatoriamente pela edge function que valida ownership.
create policy "Members revoke pairing tokens"
  on public.integration_pairing_tokens for update
  using (public.is_workspace_member(auth.uid(), workspace_id))
  with check (public.is_workspace_member(auth.uid(), workspace_id));

create policy "Service role full access pairing tokens"
  on public.integration_pairing_tokens for all
  to service_role using (true) with check (true);

-- Realtime para o modal do operador detectar last_paired_at em tempo real.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'integration_pairing_tokens'
  ) then
    alter publication supabase_realtime add table public.integration_pairing_tokens;
  end if;
end
$$;