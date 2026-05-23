# Plano — Reorganização de Configurações & Gerenciamento de Conta

Decisões: notificações → v2 · convites por e-mail → v2 (fase 3 começa com "adicionar usuário existente") · Integrações na sidebar **e** no hub.

## Arquitetura-alvo (rotas)

Hub `/settings` com `SettingsLayout` (menu lateral interno + `<Outlet/>`), deep-link por rota:

| Rota | Aba | Escopo |
|---|---|---|
| `/settings/account` | Minha Conta | usuário |
| `/settings/workspace` | Workspace + Membros | workspace |
| `/settings/ai` | IA (provider) | workspace |
| `/settings/dashboard` | Dashboard/Funil | workspace |
| `/settings/integrations` | Integrações (GHL/WhatsApp) | workspace |
| `/admin` | Administração (usuários, papéis, permissões) | admin |
| `/admin/logs` | Logs | admin |

Sidebar enxuta: Dashboard · Conversas · Sugestões · Integrações · Configurações · Admin _(admin)_ · Docs.

## Fases

### Fase 1 — Estrutura (zero mudança de dados)
- Criar `src/components/SettingsLayout.tsx` (nav interna + Outlet).
- Rotas filhas sob `/settings` em `App.tsx`; redirect `/settings` → `/settings/account`.
- Quebrar `SettingsPage.tsx`: extrair `AiSettings` (já funcional) → `/settings/ai`.
- `DashboardSettings` vira aba `/settings/dashboard` (já existe).
- Atualizar `AppSidebar.tsx` (remover "Dashboard config" solto; manter Integrações).
- **Remover** placeholders não-funcionais de Perfil/Notificações/Segurança do SettingsPage antigo.

### Fase 2 — Minha Conta funcional
- `AccountSettings`: Perfil (`profiles.full_name`, `avatar_url`) com valores reais (hoje chumbados).
- Troca de senha via `supabase.auth.updateUser({password})` (funciona já).
- Troca de e-mail via `updateUser({email})` — **depende de Auth Site URL** (ver Deploy).
- Botão Sair (signOut já existe no AuthContext).

### Fase 3 — Workspace + Membros
- Rename do workspace (lógica em `WorkspaceContext`); corrigir título "Gerenciar Contas".
- Aba Membros: mover do `Admin.tsx` a parte por-workspace (adicionar usuário existente / remover / papel).
- Excluir workspace (guarda do único workspace).

### v2 (depois)
- Notificações: `ALTER profiles ADD notification_prefs jsonb` + UI.
- Upload de avatar: bucket `avatars` + policies.
- Convite por e-mail: tabela `workspace_invites` + edge function + tela de aceite.

## Banco
- Fase 1–3: **nenhuma migration** (profiles já tem full_name/avatar_url).
- v2: migrations de notification_prefs, bucket avatars, workspace_invites.

## Dependências
- Troca de e-mail / reset por e-mail exigem **Auth Site URL/redirect** configurado (passo de deploy).
- Permissões: novas sub-rotas herdam `viewSettings`; Admin sob `isAdmin`.
