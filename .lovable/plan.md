

## Plano: Enriquecer a barra de agrupamento por contato

### Situação atual
A barra do acordeão de cada lead mostra apenas: nome, telefone, contagem de sugestões, badge de pendentes, botão IA on/off e botão rejeitar todas.

### Dados disponíveis
- **integration_label** (nome do WhatsApp): está na tabela `conversations`, acessível via `conversation_id` da sugestão. Ex: "Stevo #1", "Stevo #2".
- **ghl_assigned_to** (responsável GHL): já está em `action_data` das sugestões aprovadas.
- **updated_at / executed_at**: timestamp da última aprovação, disponível nas sugestões aprovadas.

### O que será adicionado na barra

1. **Nome do WhatsApp conectado** — extraído do `integration_label` da conversa vinculada. Será buscado via JOIN no hook `useSuggestions`.

2. **Última aprovação** — data/hora da sugestão aprovada mais recente do grupo, formatada como "há X min" ou data completa.

3. **Responsável GHL** — nome do usuário responsável (`ghl_assigned_to`) da última sugestão aprovada do grupo.

### Minha sugestão de melhoria

**Indicador visual de status consolidado por lead**: Adicionar mini-badges coloridos na barra mostrando um resumo rápido dos tipos de ação (ex: 2x Mover funil, 1x Nota) com cores correspondentes. Isso permite ver de relance quais ações a IA sugeriu sem precisar abrir o acordeão.

### Alterações técnicas

1. **`src/hooks/use-suggestions.ts`** — Modificar a query para incluir `conversations.integration_label` via select com join: `.select("*, conversations!conversation_id(integration_label)")`.

2. **`src/pages/Suggestions.tsx`**:
   - Atualizar a interface `Suggestion` para incluir `integration_label` (vindo do join).
   - No `ContactGroup`, computar: `lastApprovedAt`, `lastAssignedTo`, `integrationLabel`.
   - Renderizar na barra: ícone de WhatsApp + label, ícone de relógio + última aprovação, ícone de usuário + responsável.
   - Adicionar mini-badges de tipos de ação como resumo visual.

