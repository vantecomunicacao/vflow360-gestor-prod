-- Descomissionamento da 1.0 (Evolution / Stevo / uazap).
--
-- Decisão 06/06/2026: o produto passa a usar SÓ a Conversas 2.0 (GHL). As
-- conexões WhatsApp da 1.0 não são mais necessárias. Esta migration remove o
-- cron, os dados e as tabelas exclusivas da 1.0. As edge functions e o frontend
-- da 1.0 já foram removidos em código.
--
-- Cirúrgico: `suggestions` e `integrations` são COMPARTILHADAS com a 2.0 —
-- não são dropadas; apenas limpamos as linhas/coluna da 1.0.
-- Sem backup (decisão explícita do usuário).

-- ============================================================
-- 1) Para o cron de análise da 1.0 (a 2.0 tem os seus próprios).
-- ============================================================
select cron.unschedule('analyze-scheduler-tick')
  where exists (select 1 from cron.job where jobname = 'analyze-scheduler-tick');

-- ============================================================
-- 2) Remove as sugestões geradas pela 1.0.
--    1.0 => conversation_id IS NOT NULL ; 2.0 => conversation_id IS NULL
--    (a 2.0 usa ghl_conversation_id). Preserva as da 2.0.
-- ============================================================
delete from public.suggestions where conversation_id is not null;

-- ============================================================
-- 3) Derruba a coluna 1.0 de suggestions (e com ela a FK -> conversations).
-- ============================================================
alter table public.suggestions drop column if exists conversation_id;

-- ============================================================
-- 4) Tabelas exclusivas da 1.0.
--    CASCADE derruba FKs/policies/triggers dependentes.
-- ============================================================
drop table if exists public.messages cascade;
drop table if exists public.conversations cascade;
drop table if exists public.integration_pairing_tokens cascade;

-- ============================================================
-- 5) Remove as integrações de WhatsApp da 1.0 (mantém type='ghl').
--    uazap grava type='whatsapp'; evolution/stevo usam os whatsapp_*.
-- ============================================================
delete from public.integrations
 where type in ('whatsapp', 'whatsapp_evolution', 'whatsapp_stevo', 'whatsapp_stevo_oficial');
