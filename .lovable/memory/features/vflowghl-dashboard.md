---
name: VFlowGHL Dashboard Architecture
description: Snapshot local de dados GHL (opportunities/pipelines/users) sincronizado via edge function ghl-sync; dashboard lê do banco
type: feature
---
**Marca**: "VFlowGHL" (substitui "Copiloto GHL"). Sidebar, login, register, onboarding, docs, index.html.

**Tabelas snapshot (RLS por workspace via is_workspace_member)**:
- `ghl_pipelines` (workspace_id, ghl_id UNIQUE, name, stages jsonb)
- `ghl_users` (vendedores/location users)
- `ghl_custom_fields` (com fieldKey, model, picklist_options)
- `ghl_loss_reasons`
- `ghl_opportunities` (entidade central: pipeline_id, stage_id, status, monetary_value, source, contact_*, assigned_to, lost_reason_id, custom_fields jsonb, ghl_created_at, ghl_updated_at)
- `ghl_sync_status` (workspace_id PK; last_sync_at/status/error/duration, opportunities_count, is_running)
- `ghl_dashboard_settings` (default_pipeline_ids[], visible_custom_fields[], origin_field_name, additional_date_field, funnel_stage_mapping jsonb, won_stage_keys[])

**Edge function `ghl-sync`**:
- Aceita JWT do usuário (verifica `is_workspace_member`) OU SERVICE_ROLE (cron — pega `owner_id` do workspace).
- Lê credenciais de `integrations` (type=ghl, status=connected, workspace_id).
- Sincroniza nessa ordem: pipelines → users → custom_fields → loss_reasons → opportunities (paginação `meta.nextPageUrl`, limite 100, máx 50 páginas/5000 opps).
- Upsert por (workspace_id, ghl_id). Marca `is_running` no início e grava status/erro no fim.
- Endpoints GHL: `/opportunities/pipelines?locationId=`, `/users/?locationId=`, `/locations/{id}/customFields`, `/opportunities/loss-reason?locationId=`, `/opportunities/search?location_id=&limit=100`.

**Dashboard atual (Fase 1)**: lê `ghl_opportunities` + `ghl_pipelines` + `ghl_sync_status` direto. Botão "Atualizar agora" invoca `ghl-sync`. Health badge baseado em idade do `last_sync_at` (verde <12h, amarelo <36h, vermelho >36h ou erro).

**Regra preservada**: NÃO alterar Suggestions, ai-analyze, analyze-scheduler, tabela suggestions/ai_config.

**Próximas fases**: Fase 2 traz componentes do projeto Kommo (`43f74cb6-3455-4637-850e-4cf9cf1eff2e`) + edge `ghl-dashboard` agregadora; Fase 3 traz Settings de dashboard, Admin de usuários e cron 2×/dia (06h/18h).
