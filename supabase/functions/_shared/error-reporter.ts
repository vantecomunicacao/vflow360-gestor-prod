// Shared error reporter for edge functions.
// Sends to n8n webhook AND persists in system_logs table (best-effort, never throws).
// Translates known errors into friendly Portuguese messages with action hints and severity.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const WEBHOOK_URL =
  Deno.env.get("ERROR_WEBHOOK_URL") ||
  "https://n8n-webhook.boliqf.easypanel.host/webhook/erro-lovable";
const PROJECT = "VFlowGHL";

type Severity = "error" | "warning" | "info";
type Audience = "user" | "technical";
type Category =
  | "ai_quota"
  | "ai_credentials"
  | "ai_rate_limit"
  | "ai_content_blocked"
  | "ai_timeout"
  | "ghl_auth"
  | "ghl_not_found"
  | "ghl_validation"
  | "ghl_rate_limit"
  | "whatsapp_auth"
  | "whatsapp_send"
  | "network"
  | "code_bug"
  | "unknown";

type Options = {
  level?: Severity;
  workspaceId?: string | null;
  userId?: string | null;
  context?: Record<string, unknown>;
};

type Classification = {
  category: Category;
  severity: Severity;
  audience: Audience;
  friendlyTitle: string;
  friendlyMessage: string;
  hint: string;
};

function classifyError(source: string, rawMessage: string): Classification {
  const msg = (rawMessage || "").toLowerCase();

  // --- IA: OpenAI / Lovable AI ---
  if (msg.includes("insufficient_quota") || (msg.includes("quota") && msg.includes("exceeded"))) {
    return {
      category: "ai_quota",
      severity: "warning",
      audience: "user",
      friendlyTitle: "Créditos da IA esgotados",
      friendlyMessage: "A chave da OpenAI atingiu o limite do plano e não está mais processando análises.",
      hint: "Adicione créditos em platform.openai.com/billing ou troque o provedor para Lovable AI (Gemini) em Configurações > IA.",
    };
  }
  if (msg.includes("invalid_api_key") || msg.includes("incorrect api key") || msg.includes("401") && msg.includes("openai")) {
    return {
      category: "ai_credentials",
      severity: "warning",
      audience: "user",
      friendlyTitle: "Chave da OpenAI inválida",
      friendlyMessage: "A chave de API configurada para a OpenAI foi rejeitada.",
      hint: "Revise a chave em Configurações > IA ou troque para Lovable AI (Gemini), que não requer chave.",
    };
  }
  if (msg.includes("rate limit") || msg.includes("rate_limit") || msg.includes("429")) {
    // Distinguir quota (já tratado acima) de rate-limit real
    return {
      category: "ai_rate_limit",
      severity: "warning",
      audience: "user",
      friendlyTitle: "IA temporariamente sobrecarregada",
      friendlyMessage: "O provedor de IA está limitando requisições no momento.",
      hint: "A próxima análise será tentada automaticamente em alguns minutos. Se persistir, troque o modelo em Configurações > IA.",
    };
  }
  if (msg.includes("content_policy") || msg.includes("safety") || msg.includes("blocked")) {
    return {
      category: "ai_content_blocked",
      severity: "warning",
      audience: "user",
      friendlyTitle: "Mensagem bloqueada pela IA",
      friendlyMessage: "O conteúdo da conversa foi sinalizado pela política do provedor de IA.",
      hint: "Nenhuma ação necessária. A próxima conversa será analisada normalmente.",
    };
  }
  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("etimedout")) {
    return {
      category: "ai_timeout",
      severity: "warning",
      audience: "user",
      friendlyTitle: "Tempo esgotado",
      friendlyMessage: "A requisição demorou mais que o esperado e foi cancelada.",
      hint: "Será reprocessado automaticamente no próximo ciclo. Se ocorrer com frequência, considere usar um modelo mais rápido.",
    };
  }

  // --- GHL ---
  if (source.includes("ghl") && (msg.includes("401") || msg.includes("unauthorized") || msg.includes("invalid_token"))) {
    return {
      category: "ghl_auth",
      severity: "warning",
      audience: "user",
      friendlyTitle: "Conexão com o GoHighLevel expirou",
      friendlyMessage: "O token de acesso ao GHL foi rejeitado.",
      hint: "Reconecte sua conta em Integrações > GoHighLevel.",
    };
  }
  if (source.includes("ghl") && (msg.includes("404") || msg.includes("not found"))) {
    return {
      category: "ghl_not_found",
      severity: "warning",
      audience: "user",
      friendlyTitle: "Recurso não encontrado no GHL",
      friendlyMessage: "Um contato, oportunidade ou pipeline referenciado não existe mais no GoHighLevel.",
      hint: "Verifique se o item foi excluído. Se necessário, force uma sincronização em Integrações > GoHighLevel.",
    };
  }
  if (source.includes("ghl") && (msg.includes("422") || msg.includes("validation") || msg.includes("invalid"))) {
    return {
      category: "ghl_validation",
      severity: "warning",
      audience: "user",
      friendlyTitle: "Dados rejeitados pelo GHL",
      friendlyMessage: "O GoHighLevel rejeitou os dados enviados (campo obrigatório, formato inválido ou valor não permitido).",
      hint: "Revise a sugestão antes de aprovar novamente, ou verifique o mapeamento de campos em Integrações > GoHighLevel.",
    };
  }

  // --- WhatsApp ---
  if ((source.includes("uazap") || source.includes("stevo") || source.includes("whatsapp")) && (msg.includes("401") || msg.includes("unauthorized") || msg.includes("token"))) {
    return {
      category: "whatsapp_auth",
      severity: "warning",
      audience: "user",
      friendlyTitle: "Conexão do WhatsApp expirou",
      friendlyMessage: "A instância do WhatsApp foi desconectada ou o token é inválido.",
      hint: "Reconecte em Integrações > WhatsApp escaneando o QR Code novamente.",
    };
  }
  if (msg.includes("send") && (source.includes("uazap") || source.includes("stevo"))) {
    return {
      category: "whatsapp_send",
      severity: "warning",
      audience: "user",
      friendlyTitle: "Falha ao enviar mensagem no WhatsApp",
      friendlyMessage: "Não foi possível entregar a mensagem ao destinatário.",
      hint: "Confirme se o número é válido e se a instância do WhatsApp está conectada.",
    };
  }

  // --- Network ---
  if (msg.includes("fetch failed") || msg.includes("network") || msg.includes("econnrefused") || msg.includes("enotfound")) {
    return {
      category: "network",
      severity: "warning",
      audience: "user",
      friendlyTitle: "Falha de rede",
      friendlyMessage: "Não foi possível conectar ao serviço externo.",
      hint: "Será tentado novamente no próximo ciclo. Se persistir, verifique o status do provedor.",
    };
  }

  // --- Code bugs (TypeError, undefined, null, etc.) ---
  if (
    msg.includes("cannot read properties") ||
    msg.includes("cannot read property") ||
    msg.includes("is not a function") ||
    msg.includes("is not defined") ||
    msg.includes("undefined") && msg.includes("reading") ||
    msg.includes("typeerror")
  ) {
    return {
      category: "code_bug",
      severity: "error",
      audience: "technical",
      friendlyTitle: "Erro técnico no sistema",
      friendlyMessage: "Ocorreu um erro inesperado no processamento. A equipe técnica foi notificada automaticamente.",
      hint: "Nenhuma ação necessária do usuário. Se o problema persistir, entre em contato com o suporte.",
    };
  }

  // --- Unknown ---
  return {
    category: "unknown",
    severity: "error",
    audience: "technical",
    friendlyTitle: "Erro inesperado",
    friendlyMessage: rawMessage.slice(0, 200) || "Ocorreu um erro inesperado.",
    hint: "Se este aviso se repetir, entre em contato com o suporte informando o horário.",
  };
}

export async function reportEdgeError(
  source: string,
  error: unknown,
  options: Options = {},
): Promise<void> {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const timestamp = new Date().toISOString();

  const classification = classifyError(source, rawMessage);
  // Override de nível: se quem chamou passou explicitamente, mantemos.
  const level: Severity = options.level ?? classification.severity;

  const enrichedContext = {
    ...(options.context ?? {}),
    category: classification.category,
    audience: classification.audience,
    friendly_title: classification.friendlyTitle,
    friendly_message: classification.friendlyMessage,
    hint: classification.hint,
    raw_error: rawMessage.slice(0, 1000),
  };

  // Persist to DB (service role) — best effort
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (url && key) {
      const supabase = createClient(url, key);
      await supabase.from("system_logs").insert({
        level,
        source,
        message: classification.friendlyMessage.slice(0, 4000),
        stack: stack ? stack.slice(0, 8000) : null,
        context: enrichedContext,
        workspace_id: options.workspaceId ?? null,
        user_id: options.userId ?? null,
        env: "edge",
      });
    }
  } catch (_) {
    // ignore
  }

  // Send to n8n webhook — best effort
  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project: PROJECT,
        level,
        severity: classification.severity,
        audience: classification.audience,
        category: classification.category,
        source,
        title: classification.friendlyTitle,
        message: classification.friendlyMessage,
        hint: classification.hint,
        raw_error: rawMessage,
        stack,
        context: options.context ?? {},
        workspace_id: options.workspaceId ?? null,
        user_id: options.userId ?? null,
        timestamp,
      }),
    });
  } catch (_) {
    // ignore
  }
}
