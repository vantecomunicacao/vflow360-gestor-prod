

# Plano: Dashboard VFlowGHL adaptado de "VFlow Dados Kommo"

## Contexto e diferenças Kommo → GHL

| Aspecto | Kommo | GHL (adaptação) |
|---|---|---|
| Entidade principal | Leads | **Opportunities** + Contacts |
| Pipeline | `pipelines` + `statuses` | `pipelines` + `stages` (já mapeados em `ghl-manage`) |
| Vendedor | `users` | **Location Users** (GET `/users/?locationId=`) |
| Origem do lead | campo `_embedded.source` | `Contact.source` ou custom field configurável |
| Motivos de perda | `loss_reason_id` | `Opportunity.lostReasonId` (já temos `lost-reasons`) |
| Tempo por etapa | `events` API | calculado via histórico de `Opportunity.lastStatusChangeAt` (snapshots) |
| Auth da API | OAuth + subdomain | **Já temos** API Key + Location ID em `integrations` (type=`ghl`) |

**Conclusão**: estrutura analítica é praticamente 1:1. Trocamos "Leads" por "Opportunities" e "Sellers" por "Assigned Users". Reaproveitamos as conexões GHL já existentes em `integrations` — nada a reconectar.

## Escopo (o que vamos construir)

### 1. Renomear marca
- Logo/título de **"Copiloto GHL"** → **"VFlowGHL"** em `AppSidebar.tsx`, `index.html`, `Login`, `Register`.

### 2. Novas tabelas (snapshot do GHL — dados ficam no nosso banco)
```text
ghl_pipelines        (id, ghl_id, workspace_id, name, stages jsonb)
ghl_users            (id, ghl_id, workspace_id, name, email)
ghl_opportunities    (id, ghl_id, workspace_id, name, pipeline_id, stage_id,
                      assigned_to, contact_id, source, status, monetary_value,
                      lost_reason_id, created_at, updated_at, last_status_change_at)
ghl_custom_fields    (id, ghl_id, workspace_id, name, model)
ghl_loss_reasons     (id, ghl_id, workspace_id, name)  -- já temos lógica
ghl_sync_status      (workspace_id PK, last_sync_at, status, error, duration_ms)
ghl_dashboard_settings (workspace_id PK, default_pipeline_ids[], visible_custom_fields[],
                       origin_field_name, additional_date_field, funnel_stage_mapping jsonb,
                       won_stage_keys[])
```
RLS: tudo via `is_workspace_member(auth.uid(), workspace_id)`.

### 3. Edge functions
- **`ghl-sync`** (nova) — paginar GET `/opportunities/search?location_id=…`, `/users/`, `/opportunities/pipelines/`, custom fields, lost reasons; upsert em lote nas tabelas acima; aceita JWT do usuário **ou** SERVICE_ROLE (para cron).
- **`ghl-dashboard`** (nova) — recebe `filters` (workspace_id, dateRange, pipelineId, userId, source, additionalDateRange) e devolve `DashboardData` agregada (mesmo shape do projeto Kommo, menos `AIInsights`).
- Agendamento: `pg_cron` chamando `ghl-sync` **2× ao dia (06h e 18h)** por workspace ativo + botão "Atualizar agora" no header.

### 4. Frontend
- Copiar componentes do projeto Kommo: `Header`, `MetricCard`, `FunnelVisualization`, `SellerPerformance`, `TimePerStage`, `LeadOrigins`, `SalesOrigins`, `DataQuality`, `LossReasons`, `DailyLeads`, `LoadingState`, `ErrorState`, `AnimatedSection`, `SectionTooltip`. **Não copiar `AIInsights`**.
- Criar `src/hooks/useGhlData.ts` (mesma assinatura de `useKommoData`).
- Substituir `src/pages/Dashboard.tsx` (atual mock) pelo novo dashboard.
- Adicionar página `Settings → Dashboard` com mapeamento de etapas do funil, pipelines padrão, campo de origem, campos visíveis.

### 5. Permissões / multi-usuário
- Você (`leobarco@…` ou email atual) recebe role **`admin`** em `user_roles` (já existe `app_role` enum).
- Usuários comuns (donos de empresa) só veem workspaces dos quais são membros (RLS atual já garante).
- Página `/admin` simplificada: listar usuários, criar usuário com email/senha, atribuir a workspace, mudar senha. Reaproveita padrão de `Admin.tsx` do projeto Kommo.

### 6. Regra preservada
- **Nada** será alterado em `src/pages/Suggestions.tsx`, `ai-analyze`, `analyze-scheduler` ou tabelas `suggestions`/`ai_config`.

## Estrutura visual

```text
/dashboard
 ├─ Header (DateRange, Pipeline, Vendedor, Origem, Refresh)
 ├─ 4 MetricCards (Total Opps, Ganhas, Em Negociação, Conversão)
 ├─ FunnelVisualization | (espaço livre — sem AI Insights)
 ├─ LeadOrigins | SalesOrigins
 ├─ DataQuality | LossReasons
 ├─ DailyLeads (linha temporal)
 ├─ SellerPerformance (tabela)
 └─ TimePerStage
```

## Estimativa de créditos

| Etapa | Complexidade | Créditos estimados* |
|---|---|---|
| Renomear marca + admin role | baixa | 2–4 |
| Migration (7 tabelas + RLS + cron) | média | 4–6 |
| Edge `ghl-sync` (paginação, upsert, lost reasons, custom fields) | alta | 10–15 |
| Edge `ghl-dashboard` (agregações: funil, conversão, tempo, origens, qualidade) | alta | 10–14 |
| Hook `useGhlData` + cópia/adaptação de 13 componentes de dashboard | média-alta | 8–12 |
| Página Settings (mapeamento de funil, campos visíveis, pipeline padrão) | média | 6–8 |
| Página Admin (CRUD usuários + atribuir workspace) | média | 5–7 |
| QA, ajustes de tipos, polimento | — | 4–6 |
| **Total estimado** | | **≈ 50–70 créditos** |

*Faixa conservadora; o real depende de quantas iterações forem necessárias após você testar. Implementaremos em **3 fases** para você validar entre cada uma e evitar retrabalho:
1. **Fase 1** (≈18 cr): rebranding + tabelas + `ghl-sync` + botão refresh.
2. **Fase 2** (≈25 cr): `ghl-dashboard` + componentes + nova página Dashboard.
3. **Fase 3** (≈12 cr): Settings de dashboard + Admin de usuários + cron 2×/dia.

## Sugestões de melhoria sobre o projeto Kommo
1. **Sync incremental** usando `updated_at > last_sync_at` (Kommo faz full-sync; em GHL podemos filtrar via `query` da API) — reduz tempo e custo.
2. **Histórico de snapshots diários** numa tabela leve `ghl_daily_metrics` para gráficos de tendência reais (Kommo recalcula tudo do zero).
3. **Multi-pipeline simultâneo no funil** (Kommo já faz, manter) + **valor monetário** somado por etapa (GHL tem `monetaryValue`, Kommo não usava).
4. **Health check por workspace** no header: badge verde/amarelo/vermelho conforme idade do último sync.
5. **Export CSV** dos dados filtrados direto do dashboard.
6. **Auto-refresh opt-in** (a cada 15 min) controlado por toggle no Settings — economiza créditos de quem não precisa.

## Perguntas antes de codar
1. **Frequência de sync**: 2×/dia (06h/18h) está bom, ou prefere 4×/dia?
2. **Valor monetário**: incluir cards/gráficos de pipeline em R$ (GHL fornece) ou só contagens como no Kommo?
3. **Fase 1 primeiro?** Confirma a abordagem em 3 fases para validar entre etapas?

