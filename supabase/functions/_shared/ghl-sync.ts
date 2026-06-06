// Conversas 2.0 — logica compartilhada de sync de mensagens do GHL.
//
// Extraido de ghl-messages-sync para poder rodar INLINE em outras funcoes
// (ex: ghl-conversations-sync no tick do cron) sem chamada edge->edge, que
// falha silencioso nesse Supabase (ver memoria feedback-edge-fn-no-http).
//
// O endpoint /conversations/{id}/messages do GHL usa API version 2021-04-15.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_MESSAGES_VERSION = "2021-04-15";

export interface GhlMessage {
  id: string;
  direction: string;
  body?: string;
  messageType?: string;
  type?: number;
  contactId?: string;
  conversationId?: string;
  dateAdded: string; // ISO
  from?: string;
  to?: string;
  attachments?: unknown[];
  userId?: string;
  source?: string;
  conversationProviderId?: string;
}

interface GhlMessagesResponse {
  messages?: {
    messages?: GhlMessage[];
    lastMessageId?: string;
    nextPage?: boolean;
  };
}

export async function ghlFetchMessages(
  apiKey: string,
  conversationId: string,
  lastMessageId?: string,
  limit = 100,
): Promise<{ messages: GhlMessage[]; lastMessageId?: string; nextPage: boolean }> {
  const url = new URL(`${GHL_BASE_URL}/conversations/${conversationId}/messages`);
  url.searchParams.set("limit", String(limit));
  if (lastMessageId) url.searchParams.set("lastMessageId", lastMessageId);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: GHL_MESSAGES_VERSION,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GHL conversations/{id}/messages ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = JSON.parse(text) as GhlMessagesResponse;
  const inner = json?.messages || {};
  return {
    messages: (inner.messages || []) as GhlMessage[],
    lastMessageId: inner.lastMessageId,
    nextPage: !!inner.nextPage,
  };
}

// Itens de atividade do GHL ("Opportunity created", "Appointment booked",
// "Contact created", etc.) chegam no MESMO endpoint das mensagens, com
// messageType comecando em TYPE_ACTIVITY. Nao sao falas reais: poluem o
// historico que a IA le e, como vem marcados outbound, sao contados como
// "resposta do vendedor" no tempo medio de resposta. Filtramos no sync.
export function isActivityMessage(messageType?: string | null): boolean {
  return !!messageType && messageType.toUpperCase().startsWith("TYPE_ACTIVITY");
}

// Mensagens de CONTROLE da automacao (Evolution/Stevo) vazam para o historico
// como TYPE_WHATSAPP outbound, mas nao sao fala humana: avisos de sistema e
// comandos. Poluem o contexto da IA e, por serem outbound, contam como
// "resposta do vendedor" no tempo medio de resposta. Filtramos por padrao do
// corpo. Padroes ancorados no inicio (fala real nao comeca com "#cmd|").
const SYSTEM_NOISE_PATTERNS: RegExp[] = [
  /^Number Active:/i, // aviso "Number Active: <num> / Instance: <inst>"
  /^Envio de mensagem ativa/i, // aviso de disparo ativo
  /^#[a-zA-Z_]+\|/, // comandos: #sw|3, #template|chile_inicio, ...
];

export function isSystemNoiseMessage(body?: string | null): boolean {
  if (!body) return false;
  const t = body.trimStart();
  return SYSTEM_NOISE_PATTERNS.some((re) => re.test(t));
}

export interface SyncMessagesResult {
  synced: number;
  pages: number;
  maxDateAdded: string | null; // ISO da mensagem mais nova vista (para messages_synced_until)
}

// Pagina as mensagens de UMA conversa (do mais novo para o mais antigo),
// faz upsert em ghl_messages e retorna a maior date_added vista.
// Assume que a conversa ja existe em ghl_conversations (FK).
export async function syncConversationMessages(
  supabase: SupabaseClient,
  opts: {
    workspaceId: string;
    ghlConversationId: string;
    apiKey: string;
    maxMessages?: number;
  },
): Promise<SyncMessagesResult> {
  const { workspaceId, ghlConversationId, apiKey } = opts;
  const maxMessages = Math.min(Math.max(1, opts.maxMessages ?? 100), 500);

  let cursor: string | undefined = undefined;
  let totalSynced = 0; // itens lidos da API (mensagens + atividades) — controla cap/paginacao
  let realSynced = 0; // falas reais gravadas (sem atividades)
  let pages = 0;
  let maxDateAddedMs = 0;

  while (totalSynced < maxMessages) {
    const pageLimit = Math.min(100, maxMessages - totalSynced);
    const { messages, lastMessageId, nextPage } = await ghlFetchMessages(
      apiKey,
      ghlConversationId,
      cursor,
      pageLimit,
    );
    pages++;
    if (!messages.length) break;

    // maxDateAdded avanca sobre TODOS os itens vistos (inclusive atividades),
    // para o watermark refletir ate onde a API ja foi lida e nao re-paginar.
    // Mas so gravamos falas reais (atividades sao puladas — ver isActivityMessage).
    const rows: Record<string, unknown>[] = [];
    for (const m of messages) {
      const ms = m.dateAdded ? new Date(m.dateAdded).getTime() : 0;
      if (ms > maxDateAddedMs) maxDateAddedMs = ms;
      const messageType = m.messageType || (typeof m.type === "number" ? `TYPE_${m.type}` : null);
      if (isActivityMessage(messageType) || isSystemNoiseMessage(m.body)) continue;
      rows.push({
        workspace_id: workspaceId,
        ghl_conversation_id: ghlConversationId,
        ghl_message_id: m.id,
        direction: m.direction || "unknown",
        body: m.body || null,
        message_type: messageType,
        from_field: m.from || null,
        to_field: m.to || null,
        attachments_json: m.attachments && m.attachments.length ? m.attachments : null,
        ghl_user_id: m.userId || null,
        date_added: m.dateAdded,
        synced_at: new Date().toISOString(),
      });
    }

    if (rows.length) {
      const { error: upErr } = await supabase
        .from("ghl_messages")
        .upsert(rows, { onConflict: "workspace_id,ghl_message_id" });
      if (upErr) throw new Error(`Upsert ghl_messages falhou: ${upErr.message}`);
    }
    totalSynced += messages.length; // conta itens lidos (para cap/paginacao)
    realSynced += rows.length;

    if (!nextPage || !lastMessageId) break;
    cursor = lastMessageId;
  }

  return {
    synced: realSynced,
    pages,
    maxDateAdded: maxDateAddedMs ? new Date(maxDateAddedMs).toISOString() : null,
  };
}
