
# Multi-Contas (Workspaces)

## Conceito
Cada "conta" é um **workspace** independente. Um usuário pode ter vários workspaces, cada um com suas próprias integrações (GHL + WhatsApp), conversas, sugestões e configurações de IA.

## Etapa 1 — Banco de dados
- Criar tabela `workspaces` (id, name, owner_id, created_at)
- Criar tabela `workspace_members` (workspace_id, user_id, role)
- Adicionar coluna `workspace_id` nas tabelas: `integrations`, `conversations`, `suggestions`, `ai_config`, `ai_provider_config`, `disabled_contacts`
- Atualizar RLS para filtrar por workspace_id via membership
- Migrar dados existentes para um workspace padrão

## Etapa 2 — Backend (Edge Functions)
- Webhooks (uazap-webhook, stevo-webhook) precisam identificar o workspace pela instância
- ai-analyze e ghl-manage precisam receber/resolver workspace_id
- Todas as queries nas Edge Functions passam a filtrar por workspace_id

## Etapa 3 — Frontend
- Seletor de workspace no sidebar/header
- Tela para criar novo workspace
- Persistir workspace ativo (localStorage ou contexto)
- Todas as queries do frontend filtram por workspace ativo
- Página de configurações por workspace

## Impacto
- **Alto**: Toca praticamente todas as tabelas, queries e edge functions
- Recomendo implementar em partes, começando pelo banco
