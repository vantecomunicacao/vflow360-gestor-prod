

# Bug: Webhooks roteando mensagens para o workspace errado

## Diagnóstico

O problema foi confirmado nos dados:

- A integração **"Deyvison - TU"** (`01dc29c8`) pertence ao workspace **Tanques União** (`1b745ecb`).
- Porém, a conversa do contato "Leo Barco" (`554491834177`) com label "Deyvison - TU" está no workspace **AcquaVitalle** (`8a92803b`).

**Causa raiz**: Tanto `stevo-webhook` quanto `uazap-webhook` buscam a conversa existente usando apenas `user_id` + `contact_phone`, **sem filtrar por `workspace_id`**. Como o mesmo usuário é dono de ambos os workspaces, se um contato já existia em AcquaVitalle, o webhook da Tanques União encontra essa conversa e grava as mensagens lá.

## Correção

### 1. Corrigir `stevo-webhook/index.ts` (linhas 679-684)

Adicionar `.eq("workspace_id", workspaceId)` na query de busca da conversa:

```typescript
let { data: conversation } = await supabase
  .from("conversations")
  .select("id, unread_count, contact_name")
  .eq("user_id", userId)
  .eq("workspace_id", workspaceId)   // ← NOVO
  .eq("contact_phone", phone)
  .maybeSingle();
```

### 2. Corrigir `uazap-webhook/index.ts` (linhas 626-629)

Mesma correção:

```typescript
let { data: conversation } = await supabase
  .from("conversations")
  .select("id, unread_count")
  .eq("user_id", userId)
  .eq("workspace_id", workspaceId)   // ← NOVO
  .eq("contact_phone", phone)
  .single();
```

### 3. Corrigir conversa existente contaminada

Mover a conversa "Leo Barco" (`554491834177`) que está em AcquaVitalle com label "Deyvison - TU" para o workspace correto (Tanques União), via migration SQL:

```sql
UPDATE conversations
SET workspace_id = '1b745ecb-c541-42a1-a91c-71cd71d75b53'
WHERE id = '81857066-3ab0-4754-bdf0-9cb1c34cfd5d';
```

### 4. Re-deploy ambas as Edge Functions

---

**Impacto**: Correção de 1 linha em cada webhook + 1 migration para dados existentes. Sem mudanças de UI.

