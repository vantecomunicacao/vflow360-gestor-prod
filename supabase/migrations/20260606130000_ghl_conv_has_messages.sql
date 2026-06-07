-- Conversas 2.0 — flag durável "tem mensagem real" em ghl_conversations.
--
-- Problema: o channel_type da conversa vem do lastMessageType do GHL e pode
-- virar email (disparo de marketing) mesmo em cima de uma conversa real de
-- SMS/WhatsApp. O cron de sync sobrescreve channel_type a cada ciclo, então
-- esconder a conversa só pelo canal nao e durável (some conversa real).
--
-- Solucao: coluna has_messages mantida por trigger no insert de ghl_messages
-- (o upsert do cron nao inclui essa coluna, entao nunca a reverte). A lista
-- esconde so EMAIL PURO: channel email E has_messages=false.

alter table public.ghl_conversations
  add column if not exists has_messages boolean not null default false;

-- Backfill
update public.ghl_conversations c set has_messages = true
where has_messages = false and exists (
  select 1 from public.ghl_messages m
  where m.workspace_id = c.workspace_id
    and m.ghl_conversation_id = c.ghl_conversation_id);

-- Marca has_messages=true quando uma mensagem real entra (atividades, email e
-- ruido de automacao ja sao filtrados antes do insert em _shared/ghl-sync.ts).
create or replace function public.mark_conv_has_messages()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  update public.ghl_conversations
    set has_messages = true
  where workspace_id = new.workspace_id
    and ghl_conversation_id = new.ghl_conversation_id
    and has_messages is distinct from true;
  return new;
end; $fn$;

drop trigger if exists trg_mark_conv_has_messages on public.ghl_messages;
create trigger trg_mark_conv_has_messages
  after insert on public.ghl_messages
  for each row execute function public.mark_conv_has_messages();
