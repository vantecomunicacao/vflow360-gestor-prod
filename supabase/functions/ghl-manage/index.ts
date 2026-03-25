import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GHL_BASE_URL = "https://services.leadconnectorhq.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const payload = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = typeof payload.action === "string" ? payload.action : "";
    const apiKey = typeof payload.apiKey === "string" ? payload.apiKey.trim() : "";
    const locationId = typeof payload.locationId === "string" ? payload.locationId.trim() : "";

    const clearGhlConnection = async () => {
      await supabase.from("integrations").upsert(
        {
          user_id: user.id,
          type: "ghl",
          status: "disconnected",
          config: {},
        },
        { onConflict: "user_id,type" }
      );
    };

    const validateGhlCredentials = async (candidateApiKey: string, candidateLocationId: string) => {
      const testUrl = new URL(`/locations/${candidateLocationId}`, GHL_BASE_URL);
      const testResponse = await fetch(testUrl.toString(), {
        headers: {
          Authorization: `Bearer ${candidateApiKey}`,
          "Content-Type": "application/json",
          Version: "2021-07-28",
        },
      });

      if (!testResponse.ok) {
        const errData = await testResponse.json().catch(() => ({}));
        throw new Error(
          testResponse.status === 401
            ? "API Key inválida. Verifique suas credenciais."
            : `Erro ao conectar ao GHL [${testResponse.status}]: ${JSON.stringify(errData)}`
        );
      }

      return await testResponse.json();
    };

    // Helper to get stored GHL credentials
    const getGhlCredentials = async () => {
      const { data: integration } = await supabase
        .from("integrations")
        .select("config, status")
        .eq("user_id", user.id)
        .eq("type", "ghl")
        .single();
      if (!integration || integration.status !== "connected") {
        throw new Error("GHL not connected. Please add your credentials first.");
      }
      const config = integration.config as { apiKey?: string; locationId?: string };
      if (!config.apiKey || !config.locationId) throw new Error("GHL credentials incomplete");
      return config;
    };

    // Helper to call GHL API
    const callGhl = async (endpoint: string, method = "GET", body?: unknown, skipLocationId = false) => {
      const creds = await getGhlCredentials();
      const url = new URL(endpoint, GHL_BASE_URL);
      if (!skipLocationId && !url.searchParams.has("locationId")) {
        url.searchParams.set("locationId", creds.locationId!);
      }

      const options: RequestInit = {
        method,
        headers: {
          Authorization: `Bearer ${creds.apiKey}`,
          "Content-Type": "application/json",
          Version: "2021-07-28",
        },
      };
      if (body && method !== "GET") {
        options.body = JSON.stringify(body);
      }

      console.log(`GHL API call: ${method} ${url.toString()}`);
      const response = await fetch(url.toString(), options);
      const responseText = await response.text();
      console.log(`GHL API response [${response.status}]: ${responseText.substring(0, 500)}`);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          await clearGhlConnection();
          throw new Error("Credenciais GHL inválidas ou expiradas. Reconecte sua conta.");
        }
        throw new Error(`GHL API error [${response.status}]: ${responseText}`);
      }

      let data: unknown = null;
      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch {
        data = responseText;
      }

      return data;
    };

    switch (action) {
      case "connect": {
        // Save credentials and test connection
        if (!apiKey || !locationId) throw new Error("API Key and Location ID are required");

        let locationData;
        try {
          locationData = await validateGhlCredentials(apiKey, locationId);
        } catch (validationError) {
          await clearGhlConnection();
          throw validationError;
        }

        // Save credentials
        await supabase.from("integrations").upsert(
          {
            user_id: user.id,
            type: "ghl",
            config: { apiKey, locationId, locationName: locationData.location?.name || locationData.name || locationId },
            status: "connected",
          },
          { onConflict: "user_id,type" }
        );

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              locationName: locationData.location?.name || locationData.name || locationId,
              status: "connected",
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "disconnect": {
        await supabase
          .from("integrations")
          .update({ status: "disconnected", config: {} })
          .eq("user_id", user.id)
          .eq("type", "ghl");

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "status": {
        const { data: integration } = await supabase
          .from("integrations")
          .select("config, status")
          .eq("user_id", user.id)
          .eq("type", "ghl")
          .single();

        if (!integration) {
          return new Response(
            JSON.stringify({ success: true, data: { status: "not_connected" } }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const config = integration.config as { apiKey?: string; locationId?: string; locationName?: string };

        if (integration.status !== "connected" || !config.apiKey || !config.locationId) {
          await clearGhlConnection();
          return new Response(
            JSON.stringify({ success: true, data: { status: "disconnected", locationName: "" } }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        try {
          await validateGhlCredentials(config.apiKey, config.locationId);
        } catch {
          await clearGhlConnection();
          return new Response(
            JSON.stringify({ success: true, data: { status: "disconnected", locationName: "" } }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              status: integration.status,
              locationName: config.locationName || "",
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "contacts": {
        const data = await callGhl("/contacts/");
        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "search_contacts": {
        const query = typeof payload.query === "string" ? payload.query : "";
        const data = await callGhl(`/contacts/search?query=${encodeURIComponent(query || "")}`);
        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "pipelines": {
        const data = await callGhl("/opportunities/pipelines");
        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "opportunities": {
        const data = await callGhl("/opportunities/search");
        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "custom_fields": {
        const creds = await getGhlCredentials();
        const data = await callGhl("/locations/" + creds.locationId + "/customFields?model=all", "GET", undefined, true);
        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "save_mappings": {
        const selectedFields = Array.isArray(payload.selectedFields) ? payload.selectedFields : [];
        const selectedStages = Array.isArray(payload.selectedStages) ? payload.selectedStages : [];
        const prompt = typeof payload.aiPrompt === "string" ? payload.aiPrompt : "";
        
        // Get current config to preserve apiKey/locationId
        const { data: currentIntegration } = await supabase
          .from("integrations")
          .select("config")
          .eq("user_id", user.id)
          .eq("type", "ghl")
          .single();
        
        if (!currentIntegration) throw new Error("GHL not connected");
        const currentConfig = currentIntegration.config as Record<string, unknown>;
        
        await supabase
          .from("integrations")
          .update({
            config: {
              ...currentConfig,
              selectedFields,
              selectedStages,
              aiPrompt: prompt,
            },
          })
          .eq("user_id", user.id)
          .eq("type", "ghl");

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get_mappings": {
        const { data: integration } = await supabase
          .from("integrations")
          .select("config")
          .eq("user_id", user.id)
          .eq("type", "ghl")
          .single();
        
        if (!integration) {
          return new Response(JSON.stringify({ success: true, data: { selectedFields: [], selectedStages: [], aiPrompt: "" } }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
        const config = integration.config as Record<string, unknown>;
        return new Response(JSON.stringify({
          success: true,
          data: {
            selectedFields: config.selectedFields || [],
            selectedStages: config.selectedStages || [],
            aiPrompt: config.aiPrompt || "",
          },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "execute_suggestion": {
        const suggestionId = payload.suggestionId as string;
        if (!suggestionId) throw new Error("suggestionId is required");

        // Fetch the suggestion
        const { data: suggestion, error: sugErr } = await supabase
          .from("suggestions")
          .select("*")
          .eq("id", suggestionId)
          .eq("user_id", user.id)
          .single();
        if (sugErr || !suggestion) throw new Error("Sugestão não encontrada");

        const actionData = suggestion.action_data as Record<string, any>;
        const contactPhone = actionData?.contact_phone;
        if (!contactPhone) throw new Error("Sugestão sem telefone de contato associado.");

        // 1. Search contact in GHL by phone (multiple BR formats) then by email
        const cleanPhone = contactPhone.replace(/\D/g, "");
        
        // Generate all possible phone format variations for BR numbers
        const phoneVariations: string[] = [];
        let baseNumber = cleanPhone;
        // Strip country code if present
        if (baseNumber.startsWith("55") && baseNumber.length >= 12) {
          baseNumber = baseNumber.slice(2);
        }
        // baseNumber is now DDD + number (e.g. 11999998888)
        // Add variations: +55DDD, 55DDD, DDD only, with and without 9th digit
        phoneVariations.push(`+55${baseNumber}`, `55${baseNumber}`, baseNumber);
        // If 11 digits (with 9th digit), also try without it
        if (baseNumber.length === 11) {
          const without9 = baseNumber.slice(0, 2) + baseNumber.slice(3);
          phoneVariations.push(`+55${without9}`, `55${without9}`, without9);
        }
        // If 10 digits (without 9th digit), also try with it
        if (baseNumber.length === 10) {
          const with9 = baseNumber.slice(0, 2) + "9" + baseNumber.slice(2);
          phoneVariations.push(`+55${with9}`, `55${with9}`, with9);
        }
        // Also try the original input as-is
        phoneVariations.push(cleanPhone);
        
        // Deduplicate
        const uniqueVariations = [...new Set(phoneVariations)];
        console.log(`Searching contact with phone variations: ${uniqueVariations.join(", ")}`);

        let contacts: any[] = [];
        for (const variation of uniqueVariations) {
          if (contacts.length > 0) break;
          const result = await callGhl(`/contacts/?query=${encodeURIComponent(variation)}`) as any;
          contacts = result?.contacts || [];
        }

        // Also try searching by email if available
        const contactEmail = actionData?.contact_email;
        if (contacts.length === 0 && contactEmail) {
          console.log(`Phone not found, trying email: ${contactEmail}`);
          const emailResult = await callGhl(`/contacts/?query=${encodeURIComponent(contactEmail)}`) as any;
          contacts = emailResult?.contacts || [];
        }

        let contactCreated = false;
        let contactId: string;
        let contact: any;
        const creds = await getGhlCredentials();

        if (contacts.length === 0) {
          // Create the contact in GHL
          console.log(`Contact not found, creating new contact for phone: ${contactPhone}`);
          const formattedPhone = baseNumber.length >= 10 ? `+55${baseNumber}` : contactPhone;
          const contactName = actionData?.contact_name || `Lead ${formattedPhone}`;

          const newContact = await callGhl("/contacts/", "POST", {
            locationId: creds.locationId,
            phone: formattedPhone,
            name: contactName,
            firstName: contactName.split(" ")[0],
            lastName: contactName.split(" ").slice(1).join(" ") || "",
            ...(contactEmail ? { email: contactEmail } : {}),
          }, true) as any;

          contact = newContact?.contact || newContact;
          if (!contact?.id) throw new Error("Falha ao criar contato no CRM.");
          contactId = contact.id;
          contactCreated = true;
          console.log(`Created new GHL contact: ${contactId}`);
        } else {
          contact = contacts[0];
          contactId = contact.id;
          console.log(`Found GHL contact: ${contactId} (${contact.name || contact.firstName})`);
        }

        // 2. Search for latest opportunity for this contact
        const oppsResult = await callGhl(`/opportunities/search?location_id=${creds.locationId}&contact_id=${contactId}`, "GET", undefined, true) as any;
        const opportunities = oppsResult?.opportunities || [];
        
        let opportunity: any = null;
        let opportunityCreated = false;

        if (opportunities.length > 0) {
          // Sort by date desc and pick the latest
          opportunity = opportunities.sort((a: any, b: any) => 
            new Date(b.createdAt || b.dateAdded || 0).getTime() - new Date(a.createdAt || a.dateAdded || 0).getTime()
          )[0];
          console.log(`Found existing opportunity: ${opportunity.id}`);
        } else {
          // Create a new opportunity - need a pipeline and stage
          const pipelinesResult = await callGhl("/opportunities/pipelines") as any;
          const pipelines = pipelinesResult?.pipelines || [];
          if (pipelines.length === 0) throw new Error("Nenhum funil encontrado no CRM para criar oportunidade.");
          
          const pipeline = pipelines[0];
          const firstStage = pipeline.stages?.[0];
          if (!firstStage) throw new Error("Nenhuma etapa encontrada no funil para criar oportunidade.");

          const newOpp = await callGhl("/opportunities/", "POST", {
            pipelineId: pipeline.id,
            pipelineStageId: firstStage.id,
            locationId: creds.locationId,
            contactId: contactId,
            name: `Oportunidade - ${contact.name || contact.firstName || contactPhone}`,
            status: "open",
          }, true) as any;
          
          opportunity = newOpp?.opportunity || newOpp;
          opportunityCreated = true;
          console.log(`Created new opportunity: ${opportunity?.id}`);
        }

        if (!opportunity?.id) throw new Error("Falha ao obter oportunidade.");

        // 3. Execute the action based on suggestion type
        let executionResult = "";
        const suggestionType = suggestion.type;

        switch (suggestionType) {
          case "mover_funil": {
            const targetStageName = actionData?.value;
            if (!targetStageName) throw new Error("Etapa de destino não especificada na sugestão.");
            
            // Find the stage
            const pipelinesData = await callGhl("/opportunities/pipelines") as any;
            let targetStage: any = null;
            let targetPipelineId = "";
            for (const p of (pipelinesData?.pipelines || [])) {
              const found = p.stages?.find((s: any) => 
                s.name.toLowerCase() === targetStageName.toLowerCase()
              );
              if (found) { targetStage = found; targetPipelineId = p.id; break; }
            }
            if (!targetStage) throw new Error(`Etapa "${targetStageName}" não encontrada nos funis do CRM.`);
            
            await callGhl(`/opportunities/${opportunity.id}`, "PUT", {
              pipelineId: targetPipelineId,
              pipelineStageId: targetStage.id,
            }, true);
            executionResult = `Lead movido para a etapa "${targetStageName}"`;
            break;
          }

          case "campo_personalizado": {
            const fieldKey = actionData?.field;
            const fieldValue = actionData?.value;
            if (!fieldKey || !fieldValue) throw new Error("Campo ou valor não especificado na sugestão.");
            
            await callGhl(`/contacts/${contactId}`, "PUT", {
              customFields: [{ key: fieldKey, value: fieldValue }],
            }, true);
            executionResult = `Campo "${fieldKey}" atualizado para "${fieldValue}"`;
            break;
          }

          case "adicionar_nota": {
            const noteBody = actionData?.value || suggestion.description || suggestion.title;
            await callGhl(`/contacts/${contactId}/notes`, "POST", {
              body: noteBody,
            }, true);
            executionResult = `Nota adicionada ao contato`;
            break;
          }

          case "valor_negociacao": {
            const monetaryValue = parseFloat((actionData?.value || "0").replace(/[^\d.,]/g, "").replace(",", "."));
            await callGhl(`/opportunities/${opportunity.id}`, "PUT", {
              monetaryValue: monetaryValue,
            }, true);
            executionResult = `Valor da negociação atualizado para R$ ${monetaryValue.toFixed(2)}`;
            break;
          }

          case "ganho_perdido": {
            const status = (actionData?.value || "").toLowerCase().includes("ganh") ? "won" : "lost";
            await callGhl(`/opportunities/${opportunity.id}`, "PUT", {
              status: status,
            }, true);
            executionResult = `Oportunidade marcada como ${status === "won" ? "ganha" : "perdida"}`;
            break;
          }

          case "agendar_lembrete": {
            // Add as a note with reminder tag since GHL tasks API may vary
            const reminderText = actionData?.value || suggestion.title;
            await callGhl(`/contacts/${contactId}/notes`, "POST", {
              body: `⏰ LEMBRETE: ${reminderText}`,
            }, true);
            executionResult = `Lembrete adicionado como nota no contato`;
            break;
          }

          default:
            executionResult = `Tipo de ação "${suggestionType}" não suportado para execução automática.`;
        }

        // 4. Update suggestion with execution result
        const creationNotes: string[] = [];
        if (contactCreated) creationNotes.push("Novo contato criado no CRM");
        if (opportunityCreated) creationNotes.push("Nova oportunidade criada");

        await supabase.from("suggestions").update({
          status: "approved",
          action_data: { 
            ...actionData, 
            executed: true, 
            execution_result: executionResult,
            ghl_contact_id: contactId,
            ghl_opportunity_id: opportunity.id,
            opportunity_created: opportunityCreated,
            contact_created: contactCreated,
          },
        }).eq("id", suggestionId);

        const resultMessage = [executionResult, ...creationNotes].join(". ") + ".";

        return new Response(JSON.stringify({ 
          success: true, 
          data: { 
            message: resultMessage,
            opportunityCreated,
            contactCreated,
            contactId,
            opportunityId: opportunity.id,
          } 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error("ghl-manage error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
