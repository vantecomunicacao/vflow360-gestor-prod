import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { reportEdgeError } from "../_shared/error-reporter.ts";

// ====== Exported helpers for testing ======
export const VALID_SUGGESTION_TYPES = [
  "mover_funil",
  "campo_personalizado",
  "adicionar_nota",
  "valor_negociacao",
  "agendar_lembrete",
  "ganho_perdido",
];

export const LEGACY_TYPE_MAP: Record<string, string> = {
  "🗓️ contato futuro": "agendar_lembrete",
  "field_personalizado": "campo_personalizado",
  "mov_funil": "mover_funil",
};

export function normalizeSuggestionType(type: string): string | null {
  const normalized = LEGACY_TYPE_MAP[type.toLowerCase().trim()] || type;
  return VALID_SUGGESTION_TYPES.includes(normalized) ? normalized : null;
}

export function resolveAiModel(
  providerConfig: { provider?: string; api_key?: string; model?: string } | null,
): { useOpenAI: boolean; model: string; providerLabel: string } {
  const useOpenAI = providerConfig?.provider === "openai" && !!providerConfig?.api_key;
  const model = useOpenAI ? (providerConfig?.model || "gpt-4o-mini") : "google/gemini-2.5-flash";
  return { useOpenAI, model, providerLabel: useOpenAI ? "openai" : "lovable" };
}

export function buildAiProviderString(
  providerConfig: { model?: string } | null,
  resolved: { useOpenAI: boolean; model: string; providerLabel: string },
): string {
  return resolved.useOpenAI
    ? `openai/${providerConfig?.model || "gpt-4o-mini"}`
    : `lovable/${resolved.model}`;
}
// ====== End helpers ======

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const payload = await req.json();
    const conversationId = payload.conversation_id;
    const userId = payload.user_id;

    // If called from frontend with auth header, verify user
    const authHeader = req.headers.get("Authorization");
    let resolvedUserId = userId;
    if (authHeader && !userId) {
      const token = authHeader.replace("Bearer ", "");
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user }, error } = await userClient.auth.getUser();
      if (error || !user) throw new Error("Unauthorized");
      resolvedUserId = user.id;
    }

    if (!conversationId || !resolvedUserId) {
      throw new Error("conversation_id and user_id are required");
    }

    // 1. Fetch conversation messages (last 20)
    const { data: messagesDesc, error: msgErr } = await supabase
      .from("messages")
      .select("content, direction, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(20);
    const messages = (messagesDesc || []).slice().reverse();

    if (msgErr) throw new Error(`Error fetching messages: ${msgErr.message}`);
    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ success: true, data: { suggestions: [] } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fetch conversation info
    const { data: conversation } = await supabase
      .from("conversations")
      .select("contact_name, contact_phone, workspace_id, analyze_after, analyze_started_at")
      .eq("id", conversationId)
      .single();

    // Debounce guard: skip if a newer message pushed analyze_after into the future
    if (conversation?.analyze_after) {
      const analyzeAfterTime = new Date(conversation.analyze_after).getTime();
      if (analyzeAfterTime > Date.now()) {
        console.log(`Debounce: skipping analysis for ${conversationId}, analyze_after=${conversation.analyze_after} is in the future`);
        return new Response(JSON.stringify({ success: true, data: { suggestions: [], skipped: true, reason: "debounce" } }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 2b. Check if this contact is disabled for AI analysis
    if (conversation?.contact_phone) {
      const { data: disabledEntry } = await supabase
        .from("disabled_contacts")
        .select("id")
        .eq("user_id", resolvedUserId)
        .eq("contact_phone", conversation.contact_phone)
        .maybeSingle();

      if (disabledEntry) {
        return new Response(JSON.stringify({ success: true, data: { suggestions: [], skipped: true, reason: "Contact AI analysis is disabled" } }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 3. Fetch GHL integration config (mappings)
    let ghlQuery = supabase
      .from("integrations")
      .select("config, status")
      .eq("user_id", resolvedUserId)
      .eq("type", "ghl");
    if (conversation?.workspace_id) ghlQuery = ghlQuery.eq("workspace_id", conversation.workspace_id);
    const { data: ghlIntegration } = await ghlQuery.single();

    const ghlConfig = (ghlIntegration?.config || {}) as Record<string, any>;
    const selectedFields = ghlConfig.selectedFields || [];
    const selectedStages = ghlConfig.selectedStages || [];
    const aiPrompt = ghlConfig.aiPrompt || "";

    // 3b. Fetch lost reasons from GHL dedicated endpoint (for ganho_perdido suggestions)
    let lostReasonsDescription = "";
    const lostReasonsMap: Record<string, string> = {}; // id -> name for validation
    if (ghlIntegration?.status === "connected" && ghlConfig.apiKey) {
      try {
        const GHL_BASE = "https://services.leadconnectorhq.com";
        const lostReasonUrl = new URL("/opportunities/lost-reason", GHL_BASE);
        lostReasonUrl.searchParams.set("locationId", ghlConfig.locationId);
        const pResp = await fetch(lostReasonUrl.toString(), {
          headers: {
            Authorization: `Bearer ${ghlConfig.apiKey}`,
            "Content-Type": "application/json",
            Version: "2021-07-28",
          },
        });
        if (pResp.ok) {
          const pData = await pResp.json();
          const reasons: { id: string; name: string }[] = [];
          for (const reason of (pData?.lostReasons || [])) {
            const rId = reason.id || reason._id;
            reasons.push({ id: rId, name: reason.name });
            lostReasonsMap[rId] = reason.name;
          }
          if (reasons.length > 0) {
            lostReasonsDescription = `\n\nMotivos de perda disponíveis no CRM (para sugestões de "perdido", OBRIGATORIAMENTE escolha o motivo mais adequado usando o campo "lost_reason_id"):\n${reasons.map(r => `- ID: "${r.id}" → "${r.name}"`).join("\n")}`;
          }
        }
      } catch (e) {
        console.warn("Failed to fetch lost reasons:", e);
      }
    }

    // 4. Fetch AI config (which actions are enabled)
    let aiConfigQuery = supabase
      .from("ai_config")
      .select("action_type, enabled, auto_approve")
      .eq("user_id", resolvedUserId);
    if (conversation?.workspace_id) aiConfigQuery = aiConfigQuery.eq("workspace_id", conversation.workspace_id);
    const { data: aiConfigs } = await aiConfigQuery;

    const enabledActions = new Map<string, { enabled: boolean; autoApprove: boolean }>();
    const defaultActions = [
      "mover_funil", "campo_personalizado", "adicionar_nota",
      "valor_negociacao", "agendar_lembrete", "marcar_ganho", "marcar_perdido"
    ];
    for (const a of defaultActions) {
      enabledActions.set(a, { enabled: true, autoApprove: false });
    }
    if (aiConfigs) {
      for (const c of aiConfigs) {
        enabledActions.set(c.action_type, { enabled: c.enabled, autoApprove: c.auto_approve });
      }
    }

    // Backwards-compat virtual "ganho_perdido" — enabled if EITHER split toggle is on.
    // Auto-approve is decided per-suggestion later (see insert loop) based on won/lost value.
    const ganhoCfg = enabledActions.get("marcar_ganho") || { enabled: true, autoApprove: false };
    const perdidoCfg = enabledActions.get("marcar_perdido") || { enabled: true, autoApprove: false };
    enabledActions.set("ganho_perdido", {
      enabled: ganhoCfg.enabled || perdidoCfg.enabled,
      autoApprove: false, // handled per suggestion
    });

    const activeActionTypes = [...enabledActions.entries()]
      .filter(([, v]) => v.enabled)
      .map(([k]) => k)
      .filter((k) => k !== "marcar_ganho" && k !== "marcar_perdido"); // these are virtual splits, not AI types

    if (activeActionTypes.length === 0) {
      return new Response(JSON.stringify({ success: true, data: { suggestions: [] } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Restrict actions based on configured fields/stages
    const filteredActionTypes = activeActionTypes.filter((action) => {
      if (action === "mover_funil" && selectedStages.length === 0) return false;
      if (action === "campo_personalizado" && selectedFields.length === 0) return false;
      return true;
    });

    if (filteredActionTypes.length === 0) {
      return new Response(JSON.stringify({ success: true, data: { suggestions: [] } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Fetch previous suggestions for this conversation (context)
    const { data: previousSuggestions } = await supabase
      .from("suggestions")
      .select("type, title, description, status, action_data, created_at")
      .eq("conversation_id", conversationId)
      .eq("user_id", resolvedUserId)
      .order("created_at", { ascending: false })
      .limit(5);

    // Build previous suggestions context for the AI
    let previousContext = "";
    if (previousSuggestions && previousSuggestions.length > 0) {
      const prevTexts = previousSuggestions.map((s) => {
        const actionData = s.action_data as Record<string, any> || {};
        return `- [${s.status.toUpperCase()}] ${s.type}: "${s.title}" (campo: ${actionData.field || "N/A"}, valor: ${actionData.value || "N/A"})`;
      });
      previousContext = `\n\nSUGESTÕES JÁ GERADAS ANTERIORMENTE PARA ESTE CONTATO (NÃO repita estas):
${prevTexts.join("\n")}

REGRAS SOBRE SUGESTÕES ANTERIORES:
- NÃO gere sugestões que já existem acima (mesmo tipo + mesmo campo + mesmo valor)
- NÃO contradiga sugestões já aprovadas (ex: se já foi aprovado "ganho", não sugira "perdido")
- Se já existe uma sugestão pendente para o mesmo campo, NÃO gere outra para o mesmo campo
- Analise o CONTEXTO COMPLETO da conversa antes de decidir. Se há ambiguidade, NÃO sugira.`;
    }

    // 6. Build conversation text
    const conversationText = messages
      .map((m) => `[${m.direction === "inbound" ? "Lead" : "Atendente"}]: ${m.content}`)
      .join("\n");

    // 7. Build system prompt with strict constraints
    const fieldsDescription = selectedFields.length > 0
      ? `\n\nCampos do CRM disponíveis para atualização (APENAS estes campos podem ser sugeridos):\n${selectedFields
          .map((f: any) => {
            let desc = `- ${f.name} (chave: ${f.fieldKey}, tipo: ${f.dataType})`;
            if (f.description) desc += `: ${f.description}`;
            if (f.options && f.options.length > 0) {
              const optionsWithInstructions = f.options.map((opt: any) => {
                const val = typeof opt === "string" ? opt : opt.value;
                const instr = typeof opt === "object" && opt.instruction ? opt.instruction : "";
                return instr ? `"${val}" → ${instr}` : `"${val}"`;
              });
              desc += `\n  OPÇÕES VÁLIDAS (use APENAS estas):\n${optionsWithInstructions.map((o: string) => `    • ${o}`).join("\n")}`;
            }
            return desc;
          })
          .join("\n")}`
      : "";

    const stageNames = selectedStages.map((s: any) => s.name);
    const stagesDescription = selectedStages.length > 0
      ? `\n\nEtapas do funil disponíveis (use EXATAMENTE estes nomes, APENAS estas etapas podem ser sugeridas):\n${selectedStages
          .map((s: any) => `- "${s.name}" (pipeline: "${s.pipelineName}", ID: ${s.pipelineId})${s.description ? `: ${s.description}` : ""}`)
          .join("\n")}\n\nATENÇÃO: Cada etapa pertence a um pipeline específico. Use a etapa correta para o contexto da conversa. Pipelines de "vendas" são para conversas comerciais. Pipelines de "organização interna" são para conversas internas.`
      : "";

    const actionTypesDescription = `\n\nTipos de ação que você pode sugerir:
${filteredActionTypes.includes("mover_funil") ? "- mover_funil: Sugerir mover o lead para outra etapa do funil" : ""}
${filteredActionTypes.includes("campo_personalizado") ? "- campo_personalizado: Sugerir preencher/atualizar um campo personalizado" : ""}
${filteredActionTypes.includes("adicionar_nota") ? "- adicionar_nota: Sugerir adicionar uma nota no contato" : ""}
${filteredActionTypes.includes("valor_negociacao") ? "- valor_negociacao: Sugerir atualizar o valor monetário da oportunidade/negociação no CRM. SEMPRE que o lead mencionar preço, orçamento, valor, custo ou qualquer quantia monetária, use ESTE tipo (NÃO use campo_personalizado para valores monetários). O campo 'value' deve conter APENAS o número (ex: '1500' ou '1500.00'), sem 'R$' ou texto." : ""}
${filteredActionTypes.includes("agendar_lembrete") ? `- agendar_lembrete: Criar uma TAREFA no CRM com data de vencimento. Use 'task_title' para o título (ex: 'Retornar ligação', 'Enviar proposta') e 'due_date' no formato ISO 8601 com offset -03:00 (ex: '${new Date(Date.now() + 24*60*60*1000).toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T")}-03:00'). A data DEVE estar no fuso UTC-03 (horário de Brasília) e SEMPRE no futuro relativo à data atual informada acima. NUNCA use anos passados. Se a mensagem mencionar uma data/hora específica, use essa (sempre no futuro). Caso contrário, defina para 24 horas a partir de agora. O título deve refletir a ação mencionada na conversa ou 'Entrar em contato' como padrão.` : ""}
${filteredActionTypes.includes("ganho_perdido") ? (() => {
  const allowWon = ganhoCfg.enabled;
  const allowLost = perdidoCfg.enabled;
  let directions = "";
  if (allowWon && allowLost) directions = `Sugerir marcar oportunidade como ganha ou perdida. Para "perdido", é OBRIGATÓRIO incluir o campo "lost_reason_id" com o ID exato de um dos motivos de perda listados abaixo.`;
  else if (allowWon) directions = `Sugerir marcar oportunidade APENAS como ganha (status "ganho"). NUNCA sugira "perdido" — esse tipo está desativado.`;
  else if (allowLost) directions = `Sugerir marcar oportunidade APENAS como perdida (status "perdido"). NUNCA sugira "ganho" — esse tipo está desativado. É OBRIGATÓRIO incluir o campo "lost_reason_id" com o ID exato de um dos motivos de perda listados abaixo.`;
  return `- ganho_perdido: ${directions} Analise o contexto da conversa para escolher o motivo mais adequado.${allowLost ? lostReasonsDescription : ""}`;
})() : ""}`.replace(/\n\n+/g, "\n");

    // Build valid field keys set for validation
    const validFieldKeys = new Set(selectedFields.map((f: any) => f.fieldKey));
    const validStageNames = new Set(stageNames);

    const nowBrazil = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const systemPrompt = `Você é um assistente de CRM inteligente. Analise a conversa de WhatsApp abaixo e gere sugestões de ações para o CRM (Go High Level).

DATA E HORA ATUAL (referência obrigatória, fuso UTC-03 / America/Sao_Paulo): ${nowBrazil}
Qualquer data sugerida (como vencimento de tarefa) DEVE ser igual ou posterior a esta data. NUNCA use anos no passado.

${aiPrompt}
${fieldsDescription}
${stagesDescription}
${actionTypesDescription}
${previousContext}

Contato: ${conversation?.contact_name || "Desconhecido"} (${conversation?.contact_phone || ""})

REGRAS OBRIGATÓRIAS:
- Gere APENAS sugestões baseadas em evidências claras na conversa
- Cada sugestão deve ter um trecho da conversa que justifica a ação
- Não invente informações que não estão na conversa
- Seja conservador: na dúvida, não sugira
- Para "mover_funil": use EXATAMENTE um dos nomes de etapa listados acima. NUNCA invente nomes de etapas.
- Para "campo_personalizado": use APENAS campos listados acima (pela fieldKey). NUNCA sugira campos que não estão na lista.
- Se o campo tem OPÇÕES VÁLIDAS listadas, use APENAS um valor dessa lista. NUNCA invente opções.
- No campo "field" da sugestão, use a CHAVE do campo (fieldKey), não o nome amigável.
- No campo "value", use o valor exato (nome da etapa para funil, opção para dropdowns, texto para campos livres).
- Para "valor_negociacao": SEMPRE que houver menção de preço, valor, orçamento ou quantia monetária na conversa, use o tipo "valor_negociacao". NÃO coloque valores monetários em campos personalizados. O "value" deve ser APENAS o número (ex: "1500", "2300.50"), sem "R$", sem texto.
- NUNCA gere sugestões contraditórias no mesmo lote (ex: ganho E perdido ao mesmo tempo)
- Analise a conversa INTEIRA para entender a conclusão final do lead antes de sugerir ganho/perdido
- Retorne as sugestões usando a tool fornecida`;

    // 7b. Fetch AI provider config for this user
    const { data: providerConfig } = await supabase
      .from("ai_provider_config")
      .select("provider, api_key, model")
      .eq("user_id", resolvedUserId)
      .maybeSingle();

    const resolved = resolveAiModel(providerConfig || null);
    const aiEndpoint = resolved.useOpenAI
      ? "https://api.openai.com/v1/chat/completions"
      : "https://ai.gateway.lovable.dev/v1/chat/completions";
    const aiApiKey = resolved.useOpenAI ? providerConfig!.api_key : LOVABLE_API_KEY;

    if (!aiApiKey) throw new Error("No AI API key configured. Please configure an AI provider in Settings.");

    console.log(`Using AI provider: ${resolved.useOpenAI ? "OpenAI" : "Lovable AI"}, model: ${resolved.model}`);

    // 8. Call AI with tool calling for structured output
    const aiRequestBody: any = {
      model: resolved.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Analise esta conversa e gere sugestões de ações para o CRM:\n\n${conversationText}` },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "suggest_crm_actions",
            description: "Retorna sugestões de ações para o CRM baseadas na análise da conversa.",
            parameters: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        enum: filteredActionTypes,
                        description: "Tipo da ação sugerida",
                      },
                      title: {
                        type: "string",
                        description: "Título curto da sugestão (ex: 'Mover para Qualificado')",
                      },
                      description: {
                        type: "string",
                        description: "Justificativa detalhada com trecho da conversa",
                      },
                      field: {
                        type: "string",
                        description: "Para mover_funil: nome EXATO da etapa destino. Para campo_personalizado: a chave do campo (fieldKey). Para outros: campo relevante ou null.",
                      },
                      value: {
                        type: "string",
                        description: stageNames.length > 0
                          ? `Para mover_funil: DEVE ser um destes valores exatos: ${stageNames.map((n: string) => `"${n}"`).join(", ")}. Para campo_personalizado com opções: use apenas valores da lista de opções válidas. Para outros: valor livre.`
                          : "Valor sugerido para o campo ou nome da etapa destino",
                      },
                      task_title: {
                        type: "string",
                        description: "Apenas para agendar_lembrete: título da tarefa (ex: 'Retornar ligação', 'Enviar proposta'). Padrão: 'Entrar em contato'.",
                      },
                      due_date: {
                        type: "string",
                        description: "Apenas para agendar_lembrete: data/hora de vencimento em ISO 8601 com offset -03:00 (fuso horário de Brasília, UTC-03). Formato: 'YYYY-MM-DDTHH:mm:ss-03:00'. DEVE ser sempre no futuro relativo à DATA E HORA ATUAL informada no início do prompt. NUNCA use anos passados. Se não mencionada na conversa, omitir (será 24h a partir de agora).",
                      },
                      lost_reason_id: {
                        type: "string",
                        description: "OBRIGATÓRIO para ganho_perdido com valor 'perdido': ID exato do motivo de perda escolhido da lista de motivos disponíveis.",
                      },
                    },
                    required: ["type", "title", "description"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["suggestions"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "suggest_crm_actions" } },
    };

    const aiResponse = await fetch(aiEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(aiRequestBody),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) throw new Error("Rate limit exceeded. Try again later.");
      if (aiResponse.status === 402) throw new Error("AI credits exhausted. Please add funds.");
      if (aiResponse.status === 401) throw new Error("Invalid AI API key. Please check your settings.");
      throw new Error(`AI analysis failed [${aiResponse.status}]`);
    }

    const aiData = await aiResponse.json();
    console.log("AI response:", JSON.stringify(aiData).slice(0, 1000));

    // Log token usage and estimated cost
    try {
      const usage = aiData.usage || {};
      const promptTokens = Number(usage.prompt_tokens || 0);
      const completionTokens = Number(usage.completion_tokens || 0);
      const totalTokens = Number(usage.total_tokens || promptTokens + completionTokens);
      // Pricing per 1M tokens (USD). Approximate; update as needed.
      const PRICING: Record<string, { in: number; out: number }> = {
        "gpt-4o": { in: 2.5, out: 10 },
        "gpt-4o-mini": { in: 0.15, out: 0.6 },
        "gpt-4-turbo": { in: 10, out: 30 },
        "gpt-3.5-turbo": { in: 0.5, out: 1.5 },
        "google/gemini-2.5-flash": { in: 0.075, out: 0.3 },
        "google/gemini-2.5-pro": { in: 1.25, out: 5 },
      };
      const priceKey = resolved.model;
      const pr = PRICING[priceKey] || { in: 0, out: 0 };
      const costUsd = (promptTokens * pr.in + completionTokens * pr.out) / 1_000_000;
      await supabase.from("ai_usage_log").insert({
        workspace_id: conversation?.workspace_id || null,
        user_id: resolvedUserId,
        conversation_id: conversationId,
        provider: resolved.providerLabel,
        model: resolved.model,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        cost_usd: Number(costUsd.toFixed(6)),
      });
    } catch (e) {
      console.error("Failed to log AI usage:", e);
    }

    // Parse tool call response
    let suggestions: any[] = [];
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        suggestions = parsed.suggestions || [];
      } catch (e) {
        console.error("Failed to parse AI suggestions:", e);
      }
    }

    // 9. POST-GENERATION VALIDATION

    // 9a. Filter out suggestions for unconfigured fields/stages
    suggestions = suggestions.filter((s) => {
      if (s.type === "mover_funil") {
        const stageValue = s.value || s.field;
        if (!stageValue || !validStageNames.has(stageValue)) {
          console.log(`Filtered out mover_funil suggestion with invalid stage: ${stageValue}. Valid: ${[...validStageNames].join(", ")}`);
          return false;
        }
      }
      if (s.type === "campo_personalizado") {
        if (!s.field || !validFieldKeys.has(s.field)) {
          console.log(`Filtered out campo_personalizado suggestion with invalid field: ${s.field}. Valid: ${[...validFieldKeys].join(", ")}`);
          return false;
        }
      }
      return true;
    });

    // 9b. Filter contradictions within the same batch
    const hasGanho = suggestions.some((s) => s.type === "ganho_perdido" && s.value?.toLowerCase()?.includes("ganh"));
    const hasPerdido = suggestions.some((s) => s.type === "ganho_perdido" && s.value?.toLowerCase()?.includes("perd"));
    if (hasGanho && hasPerdido) {
      console.log("Contradiction detected: ganho AND perdido in same batch. Removing all ganho_perdido suggestions.");
      suggestions = suggestions.filter((s) => s.type !== "ganho_perdido");
    }

    // 9c. Filter contradictions with previous approved suggestions
    if (previousSuggestions && previousSuggestions.length > 0) {
      const approvedTypes = new Map<string, string>();
      for (const prev of previousSuggestions) {
        if (prev.status === "approved") {
          const prevData = prev.action_data as Record<string, any> || {};
          approvedTypes.set(`${prev.type}:${prevData.field || ""}`, prevData.value || "");
        }
      }

      suggestions = suggestions.filter((s) => {
        const key = `${s.type}:${s.field || ""}`;
        const prevValue = approvedTypes.get(key);
        if (prevValue !== undefined && prevValue !== s.value) {
          console.log(`Filtered contradiction with approved suggestion: ${key} was "${prevValue}", new "${s.value}"`);
          return false;
        }
        return true;
      });

      // 9d. Filter duplicates with existing suggestions (any status)
      // Use exact key match, title match, AND fuzzy keyword similarity
      const existingKeys = new Set(
        previousSuggestions.map((prev) => {
          const prevData = prev.action_data as Record<string, any> || {};
          return `${prev.type}:${prevData.field || ""}:${prevData.value || ""}`;
        })
      );

      // Normalize title: extract significant keywords (3+ chars), sorted
      const normalizeTitle = (title: string): string => {
        const stopWords = new Set(["de", "do", "da", "dos", "das", "para", "por", "com", "sem", "em", "no", "na", "nos", "nas", "um", "uma", "que", "se", "ou", "ao", "os", "as", "este", "esta", "esse", "essa", "são", "está", "foi", "ser"]);
        return title.toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter(w => w.length >= 3 && !stopWords.has(w))
          .sort()
          .join(" ");
      };

      // Check keyword overlap ratio between two normalized titles
      const titlesSimilar = (a: string, b: string): boolean => {
        const wordsA = new Set(a.split(" "));
        const wordsB = new Set(b.split(" "));
        if (wordsA.size === 0 || wordsB.size === 0) return false;
        const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
        const minSize = Math.min(wordsA.size, wordsB.size);
        return intersection / minSize >= 0.6; // 60%+ keyword overlap = duplicate
      };

      const existingNormTitles = previousSuggestions.map((prev) => ({
        type: prev.type,
        norm: normalizeTitle(prev.title),
      }));

      suggestions = suggestions.filter((s) => {
        // Exact match on type+field+value
        const key = `${s.type}:${s.field || ""}:${s.value || ""}`;
        if (existingKeys.has(key)) {
          console.log(`Filtered duplicate suggestion (exact): ${key}`);
          return false;
        }
        // Fuzzy title similarity match
        const normTitle = normalizeTitle(s.title);
        const hasSimilar = existingNormTitles.some(
          (prev) => prev.type === s.type && titlesSimilar(normTitle, prev.norm)
        );
        if (hasSimilar) {
          console.log(`Filtered duplicate suggestion (fuzzy title): "${s.title}"`);
          return false;
        }
        return true;
      });
    }

    // 10. Save suggestions to database
    const insertedSuggestions = [];
    for (const s of suggestions) {
      // For ganho_perdido, route to the right split config (marcar_ganho / marcar_perdido).
      // Skip the suggestion entirely if the corresponding split is disabled.
      let effectiveCfg = enabledActions.get(s.type);
      if (s.type === "ganho_perdido") {
        const isWon = (s.value || "").toLowerCase().includes("ganh");
        effectiveCfg = isWon ? ganhoCfg : perdidoCfg;
        if (!effectiveCfg.enabled) {
          console.log(`Skipping ganho_perdido suggestion (${isWon ? "ganho" : "perdido"} disabled)`);
          continue;
        }
      }
      const autoApprove = effectiveCfg?.autoApprove || false;
      const { data: inserted, error: insertErr } = await supabase
        .from("suggestions")
        .insert({
          user_id: resolvedUserId,
          workspace_id: conversation?.workspace_id || null,
          conversation_id: conversationId,
          type: s.type,
          title: s.title,
          description: s.description,
          status: autoApprove ? "approved" : "pending",
          action_data: {
            field: s.field || null,
            value: s.value || null,
            contact_name: conversation?.contact_name || null,
            contact_phone: conversation?.contact_phone || null,
            ...(s.type === "agendar_lembrete" ? {
              task_title: s.task_title || s.value || "Entrar em contato",
              due_date: s.due_date || null,
              task_description: s.description || null,
            } : {}),
            ...(s.type === "ganho_perdido" && s.lost_reason_id ? {
              lostReasonId: s.lost_reason_id,
              lostReasonName: lostReasonsMap[s.lost_reason_id] || null,
            } : {}),
          },
          ai_provider: buildAiProviderString(providerConfig || null, resolved),
        })
        .select()
        .single();

      if (insertErr) {
        console.error("Error inserting suggestion:", insertErr);
      } else if (inserted) {
        insertedSuggestions.push(inserted);

        // Auto-execute if auto-approve is enabled
        if (autoApprove) {
          try {
            const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
            const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
            const execResp = await fetch(`${supabaseUrl}/functions/v1/ghl-manage`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                action: "execute_suggestion",
                userId: resolvedUserId,
                suggestionId: inserted.id,
              }),
            });
            const execResult = await execResp.json();
            if (execResult.success) {
              console.log(`Auto-executed suggestion ${inserted.id} (${s.type})`);
            } else {
              const errorMsg = execResult.error || "Erro desconhecido ao executar no CRM";
              console.error(`Auto-execute failed for ${inserted.id}:`, errorMsg);
              // Revert status to pending and store error details
              const currentData = inserted.action_data as Record<string, any> || {};
              await supabase.from("suggestions").update({ 
                status: "pending",
                action_data: { ...currentData, auto_approve_error: errorMsg, auto_approve_failed_at: new Date().toISOString() },
              }).eq("id", inserted.id);
              console.log(`Reverted suggestion ${inserted.id} to pending after failed auto-execute`);
            }
          } catch (execErr) {
            const errorMsg = execErr instanceof Error ? execErr.message : "Falha de conexão com o CRM";
            console.error(`Auto-execute error for ${inserted.id}:`, execErr);
            const currentData = inserted.action_data as Record<string, any> || {};
            await supabase.from("suggestions").update({ 
              status: "pending",
              action_data: { ...currentData, auto_approve_error: errorMsg, auto_approve_failed_at: new Date().toISOString() },
            }).eq("id", inserted.id);
          }
        }
      }
    }

    // Clear debounce fields after successful analysis
    await supabase
      .from("conversations")
      .update({ analyze_after: null, analyze_started_at: null })
      .eq("id", conversationId);

    console.log(`Generated ${insertedSuggestions.length} suggestions for conversation ${conversationId}`);

    return new Response(
      JSON.stringify({ success: true, data: { suggestions: insertedSuggestions } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("ai-analyze error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack : undefined;
    await reportEdgeError("edge:ai-analyze", error);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
