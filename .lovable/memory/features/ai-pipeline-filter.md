---
name: AI Pipeline Filter
description: Filtro de funis (pipelines) GHL que limita quais conversas a IA analisa, configurado em Integrações
type: feature
---

# AI Pipeline Filter

Permite ao usuário escolher, em **Integrações → Funis analisados pela IA**, quais pipelines do GHL têm conversas analisadas pelo motor de sugestões. Objetivo: economizar tokens em conversas que migraram para funis internos (pós-venda, suporte, descarte).

## Storage
- Tabela: `ghl_dashboard_settings`
- Coluna: `ai_allowed_pipeline_ids text[] NOT NULL DEFAULT '{}'`
- Vazio = comportamento padrão (analisa tudo).

## UI
- Componente: `src/components/integrations/AiPipelineFilter.tsx`
- Renderizado em `src/pages/Integrations.tsx` logo após `<GhlSection />`, somente quando `ghlConnected === true`.
- Lê `ghl_pipelines` do workspace ativo e dá multi-select.

## Backend (`ai-analyze`)
- Após o guard de `disabled_contacts`, busca `ai_allowed_pipeline_ids`.
- Se lista não vazia: procura em `ghl_opportunities` a oportunidade mais recente (por `ghl_updated_at`) cujo `contact_phone` bata com o da conversa (match exato OU últimos 10 dígitos via `ilike %last10`).
- **Skips** (retorna `{skipped: true, reason}`): `no_contact_phone_for_pipeline_filter`, `no_opportunity_for_contact`, `pipeline_not_allowed`.
- Decisão do usuário: **lead sem oportunidade no GHL → não analisa** (mais econômico, aceita defasagem do sync 2x/dia).

## Notas
- Defasagem: como `ghl-sync` roda 2x/dia, mover lead de pipeline pode levar até 12h para refletir no filtro.
- Esta feature é uma exceção autorizada à regra Core "nunca alterar ai-analyze".
