-- Analista IA — Fase 2: chat (pergunta-e-resposta).
--
-- O gestor pergunta em linguagem natural; a edge ai-assistant decide qual dado
-- buscar (métricas por período/funil, conversas, sugestões) e responde com números
-- reais. As conversas do chat ficam em threads/messages por usuário.
--
-- Escrita: feita pela edge com service role (bypassa RLS). Leitura: o dono do
-- thread (e admin). Vendedor não acessa (é ferramenta de gestão).

-- 1) Threads (uma conversa do chat)
create table if not exists public.ai_assistant_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_threads_user_ws
  on public.ai_assistant_threads (user_id, workspace_id, updated_at desc);

alter table public.ai_assistant_threads enable row level security;

drop policy if exists "Owner reads own threads" on public.ai_assistant_threads;
create policy "Owner reads own threads"
  on public.ai_assistant_threads for select
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

drop policy if exists "Owner manages own threads" on public.ai_assistant_threads;
create policy "Owner manages own threads"
  on public.ai_assistant_threads for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.is_workspace_member(auth.uid(), workspace_id));

-- 2) Mensagens do thread
create table if not exists public.ai_assistant_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_assistant_threads(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  refs jsonb not null default '{}'::jsonb,
  tokens integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_messages_thread
  on public.ai_assistant_messages (thread_id, created_at);

alter table public.ai_assistant_messages enable row level security;

drop policy if exists "Read messages of own threads" on public.ai_assistant_messages;
create policy "Read messages of own threads"
  on public.ai_assistant_messages for select
  using (
    exists (
      select 1 from public.ai_assistant_threads t
      where t.id = ai_assistant_messages.thread_id
        and (t.user_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
    )
  );
