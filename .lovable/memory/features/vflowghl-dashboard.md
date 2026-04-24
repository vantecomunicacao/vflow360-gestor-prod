---
name: VFlowGHL Dashboard Architecture
description: Snapshot local de dados GHL (opportunities/pipelines/users) sincronizado via edge function ghl-sync; dashboard lê do banco; cron 06h/18h UTC; admin via user_roles
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

**Edge functions**:
- `ghl-sync`: aceita JWT do usuário OU SERVICE_ROLE; lê creds em `integrations`; sync pipelines→users→custom_fields→loss_reasons→opportunities (paginação `meta.nextPageUrl`).
- `ghl-dashboard`: agrega DashboardData (funil, conversão, origens, qualidade, vendedores, daily leads, lost reasons, monetary).
- `admin-users` (admin only): list_users, create_user, update_password, delete_user, set_role, add_to_workspace, remove_from_workspace.
- `admin-bootstrap`: usuário autenticado se promove a admin master se nenhum existir.

**Cron**: pg_cron schedules `ghl-sync-midnight` (00h UTC) e `ghl-sync-noon` (12h UTC) chamando `trigger_ghl_sync_all()` que lê `service_role_key` do vault e dispara `ghl-sync` para cada workspace com integration GHL conectada. Sync manual tem cooldown de 2min (client-side localStorage + server-side via `last_sync_at`) e bloqueio se `is_running` (auto-recovery após 10min travado). Retorna 429 com `code: COOLDOWN | ALREADY_RUNNING`.

**Páginas**:
- `/dashboard` — lê de `ghl_opportunities` via `ghl-dashboard`. Botão "Atualizar agora" invoca `ghl-sync`. Health badge baseado em idade do `last_sync_at`.
- `/settings/dashboard` — config por workspace: pipelines padrão, mapeamento etapa→bucket de funil (4 buckets: contato_inicial/proposta_enviada/fechamento/venda_ganha), won_stage_keys, origin_field, visible_custom_fields, additional_date_field.
- `/admin` — exclusivo admin. CRUD de usuários, atribuir/remover workspace, mudar senha, promover a admin. Quando não há admin, usuário pode se auto-promover via `admin-bootstrap`.

**Roles**: `app_role` enum (admin/user). Política `Admins can view all roles/profiles/workspaces` + `Admins can manage all workspace_members`. Hook `useIsAdmin` para sidebar/guards.

**Regra preservada**: NÃO alterar Suggestions, ai-analyze, analyze-scheduler, tabela suggestions/ai_config.

**ResponseTime (Tempo médio de resposta)**: usa o MESMO conjunto de oportunidades já filtrado pelo header (pipeline/etapa/vendedor/data). Cruza `opps.contact_phone` (normalizado p/ dígitos) com `conversations.contact_phone` do workspace. Fallback: quando `pipelineId` é null, restringe oportunidades a `stage_id ∈ (buckets mapeados ∪ won_stage_keys)`. Expediente configurável em `ghl_dashboard_settings.business_hours_{start,end}` (suporta noturno).
