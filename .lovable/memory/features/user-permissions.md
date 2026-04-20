---
name: User Permissions
description: Permissões granulares por usuário (suggestions/integrations/settings) controladas pelo admin master
type: feature
---

Tabela `user_permissions` (1 linha por user_id) com flags `view_suggestions`, `view_integrations`, `view_settings`. Dashboard e Conversas são SEMPRE liberados.

- RLS: usuário lê o próprio; só admin pode escrever.
- RPC `get_my_permissions()` (security definer) devolve as 4 flags do auth.uid() (admin recebe tudo `true`).
- Hook `usePermissions()` consome a RPC.
- `AppSidebar` filtra itens por flag; `PermissionGuard` protege rotas `/suggestions`, `/integrations`, `/settings`, `/settings/dashboard` (uma única flag `view_settings` cobre as duas rotas de settings).
- Edge `admin-users` actions: `create_user` aceita `permissions`, `set_permissions` atualiza, `list_users` retorna `permissions` por user.
- UI Admin: 3 switches no diálogo de criação + botão "Permissões" por usuário (desabilitado para admins).
- Padrão ao criar: todas desligadas. Admin é bypass total.
