import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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

    // 1. Fetch conversation messages (last 50)
    const { data: messages, error: msgErr } = await supabase
      .from("messages")
      .select("content, direction, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(50);

    if (msgErr) throw new Error(`Error fetching messages: ${msgErr.message}`);
    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ success: true, data: { suggestions: [] } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fetch conversation info
    const { data: conversation } = await supabase
      .from("conversations")
      .select("contact_name, contact_phone")
      .eq("id", conversationId)
      .single();

    // 3. Fetch GHL integration config (mappings)
    const { data: ghlIntegration } = await supabase
      .from("integrations")
      .select("config, status")
      .eq("user_id", resolvedUserId)
      .eq("type", "ghl")
      .single();

    const ghlConfig = (ghlIntegration?.config || {}) as Record<string, any>;
    const selectedFields = ghlConfig.selectedFields || [];
    const selectedStages = ghlConfig.selectedStages || [];
    const aiPrompt = ghlConfig.aiPrompt || "";

    // 4. Fetch AI config (which actions are enabled)
    const { data: aiConfigs } = await supabase
      .from("ai_config")
      .select("action_type, enabled, auto_approve")
      .eq("user_id", resolvedUserId);

    const enabledActions = new Map<string, { enabled: boolean; autoApprove: boolean }>();
    const defaultActions = [
      "mover_funil", "campo_personalizado", "adicionar_nota",
      "valor_negociacao", "agendar_lembrete", "ganho_perdido"
    ];
    // Default: all enabled, none auto-approved
    for (const a of defaultActions) {
      enabledActions.set(a, { enabled: true, autoApprove: false });
    }
    if (aiConfigs) {
      for (const c of aiConfigs) {
        enabledActions.set(c.action_type, { enabled: c.enabled, autoApprove: c.auto_approve });
      }
    }

    const activeActionTypes = [...enabledActions.entries()]
      .filter(([, v]) => v.enabled)
      .map(([k]) => k);

    if (activeActionTypes.length === 0) {
      return new Response(JSON.stringify({ success: true, data: { suggestions: [] } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Build conversation text
    const conversationText = messages
      .map((m) => `[${m.direction === "inbound" ? "Lead" : "Atendente"}]: ${m.content}`)
      .join("\n");

    // 6. Build system prompt with strict constraints
    const fieldsDescription = selectedFields.length > 0
      ? `\n\nCampos do CRM disponíveis para atualização:\n${selectedFields
          .map((f: any) => {
            let desc = `- ${f.name} (chave: ${f.fieldKey}, tipo: ${f.dataType})`;
            if (f.description) desc += `: ${f.description}`;
            if (f.options && f.options.length > 0) {
              desc += `\n  OPÇÕES VÁLIDAS (use APENAS estas): [${f.options.join(", ")}]`;
            }
            return desc;
          })
          .join("\n")}`
      : "";

    // Build strict stage names list for the AI
    const stageNames = selectedStages.map((s: any) => s.name);
    const stagesDescription = selectedStages.length > 0
      ? `\n\nEtapas do funil disponíveis (use EXATAMENTE estes nomes):\n${selectedStages
          .map((s: any) => `- "${s.name}" (pipeline: ${s.pipelineName})${s.description ? `: ${s.description}` : ""}`)
          .join("\n")}`
      : "";

    const actionTypesDescription = `\n\nTipos de ação que você pode sugerir:
${activeActionTypes.includes("mover_funil") ? "- mover_funil: Sugerir mover o lead para outra etapa do funil" : ""}
${activeActionTypes.includes("campo_personalizado") ? "- campo_personalizado: Sugerir preencher/atualizar um campo personalizado" : ""}
${activeActionTypes.includes("adicionar_nota") ? "- adicionar_nota: Sugerir adicionar uma nota no contato" : ""}
${activeActionTypes.includes("valor_negociacao") ? "- valor_negociacao: Sugerir atualizar o valor da negociação" : ""}
${activeActionTypes.includes("agendar_lembrete") ? "- agendar_lembrete: Sugerir agendar um lembrete/follow-up" : ""}
${activeActionTypes.includes("ganho_perdido") ? "- ganho_perdido: Sugerir marcar oportunidade como ganha ou perdida" : ""}`.replace(/\n\n+/g, "\n");

    const systemPrompt = `Você é um assistente de CRM inteligente. Analise a conversa de WhatsApp abaixo e gere sugestões de ações para o CRM (Go High Level).

${aiPrompt}
${fieldsDescription}
${stagesDescription}
${actionTypesDescription}

Contato: ${conversation?.contact_name || "Desconhecido"} (${conversation?.contact_phone || ""})

REGRAS OBRIGATÓRIAS:
- Gere APENAS sugestões baseadas em evidências claras na conversa
- Cada sugestão deve ter um trecho da conversa que justifica a ação
- Não invente informações que não estão na conversa
- Seja conservador: na dúvida, não sugira
- Para "mover_funil": use EXATAMENTE um dos nomes de etapa listados acima. NUNCA invente nomes de etapas.
- Para "campo_personalizado": se o campo tem OPÇÕES VÁLIDAS listadas, use APENAS um valor dessa lista. NUNCA invente opções.
- No campo "field" da sugestão, use a CHAVE do campo (fieldKey), não o nome amigável.
- No campo "value", use o valor exato (nome da etapa para funil, opção para dropdowns, texto para campos livres).
- Retorne as sugestões usando a tool fornecida`;

    // 7. Call Lovable AI with tool calling for structured output
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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
                          enum: activeActionTypes,
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
                          description: "Para mover_funil: nome EXATO da etapa destino (ex: 'Qualificando'). Para campo_personalizado: a chave do campo (fieldKey). Para outros: campo relevante ou null.",
                        },
                        value: {
                          type: "string",
                          description: stageNames.length > 0
                            ? `Para mover_funil: DEVE ser um destes valores exatos: ${stageNames.map((n: string) => `"${n}"`).join(", ")}. Para campo_personalizado com opções: use apenas valores da lista de opções válidas. Para outros: valor livre.`
                            : "Valor sugerido para o campo ou nome da etapa destino",
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
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errText);
      if (aiResponse.status === 429) throw new Error("Rate limit exceeded. Try again later.");
      if (aiResponse.status === 402) throw new Error("AI credits exhausted. Please add funds.");
      throw new Error(`AI analysis failed [${aiResponse.status}]`);
    }

    const aiData = await aiResponse.json();
    console.log("AI response:", JSON.stringify(aiData).slice(0, 1000));

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

    // 8. Save suggestions to database
    const insertedSuggestions = [];
    for (const s of suggestions) {
      const autoApprove = enabledActions.get(s.type)?.autoApprove || false;
      const { data: inserted, error: insertErr } = await supabase
        .from("suggestions")
        .insert({
          user_id: resolvedUserId,
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
          },
        })
        .select()
        .single();

      if (insertErr) {
        console.error("Error inserting suggestion:", insertErr);
      } else if (inserted) {
        insertedSuggestions.push(inserted);
      }
    }

    console.log(`Generated ${insertedSuggestions.length} suggestions for conversation ${conversationId}`);

    return new Response(
      JSON.stringify({ success: true, data: { suggestions: insertedSuggestions } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("ai-analyze error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
