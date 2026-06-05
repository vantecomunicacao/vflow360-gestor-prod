import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { reportEdgeError } from "../_shared/error-reporter.ts";

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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify user auth - support service role calls (from ai-analyze auto-execute)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const token = authHeader.replace("Bearer ", "").trim();

    // Detect service-role token by inspecting JWT claims (robust across env mismatches)
    let isServiceRole = token === SUPABASE_SERVICE_ROLE_KEY;
    if (!isServiceRole) {
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const payloadJson = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
          if (payloadJson?.role === "service_role") isServiceRole = true;
        }
      } catch (_) { /* ignore */ }
    }

    let resolvedUserId: string | null = null;

    if (isServiceRole) {
      // Called internally by another edge function with service role key
      // userId will come from the payload
    } else {
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) throw new Error("Unauthorized");
      resolvedUserId = user.id;
    }

    const payload = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = typeof payload.action === "string" ? payload.action : "";
    const apiKey = typeof payload.apiKey === "string" ? payload.apiKey.trim() : "";
    const locationId = typeof payload.locationId === "string" ? payload.locationId.trim() : "";
    let workspaceId = typeof payload.workspace_id === "string" ? payload.workspace_id : null;

    // For service role calls, get userId from payload
    if (isServiceRole && payload.userId) {
      resolvedUserId = payload.userId as string;
    }

    if (!resolvedUserId) throw new Error("Unauthorized: no user identified");

    // Build base query for GHL integration
    const ghlQuery = () => {
      let q = supabase.from("integrations").select("*").eq("user_id", resolvedUserId!).eq("type", "ghl");
      if (workspaceId) q = q.eq("workspace_id", workspaceId);
      return q;
    };

    const clearGhlConnection = async () => {
      let q = supabase.from("integrations").update({
        status: "disconnected",
        config: {},
      }).eq("user_id", resolvedUserId!).eq("type", "ghl");
      if (workspaceId) q = q.eq("workspace_id", workspaceId);
      await q;
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
      let q = supabase.from("integrations").select("config, status").eq("user_id", resolvedUserId!).eq("type", "ghl");
      if (workspaceId) q = q.eq("workspace_id", workspaceId);
      const { data: integration } = await q.single();
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
        // Return error info instead of throwing for recoverable 400 errors
        if (response.status === 400 && responseText.includes("duplicate opportunity")) {
          console.warn("Duplicate opportunity error - will handle gracefully");
          return { __duplicateError: true, status: response.status, body: responseText };
        }
        if (response.status === 400 && responseText.includes("stageId must be one of")) {
          console.warn("Invalid stageId error - will handle gracefully");
          return { __invalidStageError: true, status: response.status, body: responseText };
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

        // Save credentials - check if integration exists first
        const connectConfig = { apiKey, locationId, locationName: locationData.location?.name || locationData.name || locationId };
        let existQ = supabase.from("integrations").select("id").eq("user_id", resolvedUserId!).eq("type", "ghl");
        if (workspaceId) existQ = existQ.eq("workspace_id", workspaceId);
        const { data: existing } = await existQ.maybeSingle();
        
        if (existing) {
          let upQ = supabase.from("integrations").update({ config: connectConfig, status: "connected" }).eq("id", existing.id);
          await upQ;
        } else {
          const insertData: Record<string, unknown> = { user_id: resolvedUserId!, type: "ghl", config: connectConfig, status: "connected" };
          if (workspaceId) insertData.workspace_id = workspaceId;
          await supabase.from("integrations").insert(insertData);
        }

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
        let dq = supabase.from("integrations").update({ status: "disconnected", config: {} }).eq("user_id", resolvedUserId!).eq("type", "ghl");
        if (workspaceId) dq = dq.eq("workspace_id", workspaceId);
        await dq;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "status": {
        let sq = supabase.from("integrations").select("config, status").eq("user_id", resolvedUserId!).eq("type", "ghl");
        if (workspaceId) sq = sq.eq("workspace_id", workspaceId);
        const { data: integration } = await sq.single();

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

      case "lost_reasons": {
        // Fetch lost reasons from the dedicated endpoint
        const lostReasonResult = await callGhl("/opportunities/lost-reason") as any;
        const allLostReasons: { id: string; name: string }[] = [];
        for (const reason of (lostReasonResult?.lostReasons || [])) {
          allLostReasons.push({
            id: reason.id || reason._id,
            name: reason.name,
          });
        }
        return new Response(JSON.stringify({ success: true, data: allLostReasons }), {
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
        let smq = supabase.from("integrations").select("config").eq("user_id", resolvedUserId!).eq("type", "ghl");
        if (workspaceId) smq = smq.eq("workspace_id", workspaceId);
        const { data: currentIntegration } = await smq.single();
        
        if (!currentIntegration) throw new Error("GHL not connected");
        const currentConfig = currentIntegration.config as Record<string, unknown>;
        
        let umq = supabase.from("integrations").update({
          config: { ...currentConfig, selectedFields, selectedStages, aiPrompt: prompt },
        }).eq("user_id", resolvedUserId!).eq("type", "ghl");
        if (workspaceId) umq = umq.eq("workspace_id", workspaceId);
        await umq;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get_mappings": {
        let gmq = supabase.from("integrations").select("config").eq("user_id", resolvedUserId!).eq("type", "ghl");
        if (workspaceId) gmq = gmq.eq("workspace_id", workspaceId);
        const { data: integration } = await gmq.single();
        
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

      case "save_creation_config": {
        const allowCreateContact = payload.allowCreateContact !== false;
        const allowCreateOpportunity = payload.allowCreateOpportunity !== false;
        
        let scq = supabase.from("integrations").select("config, id").eq("user_id", resolvedUserId!).eq("type", "ghl");
        if (workspaceId) scq = scq.eq("workspace_id", workspaceId);
        const { data: scInt } = await scq.single();
        if (!scInt) throw new Error("GHL not connected");
        
        const currentCfg = scInt.config as Record<string, unknown>;
        await supabase.from("integrations").update({
          config: { ...currentCfg, allowCreateContact, allowCreateOpportunity },
        }).eq("id", scInt.id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get_creation_config": {
        let gcq = supabase.from("integrations").select("config").eq("user_id", resolvedUserId!).eq("type", "ghl");
        if (workspaceId) gcq = gcq.eq("workspace_id", workspaceId);
        const { data: gcInt } = await gcq.single();
        const cfg = (gcInt?.config || {}) as Record<string, any>;
        
        return new Response(JSON.stringify({
          success: true,
          data: {
            allowCreateContact: cfg.allowCreateContact !== false,
            allowCreateOpportunity: cfg.allowCreateOpportunity !== false,
          },
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "execute_suggestion": {
        const suggestionId = payload.suggestionId as string;
        if (!suggestionId) throw new Error("suggestionId is required");

        // Fetch the suggestion
        const { data: suggestion, error: sugErr } = await supabase
          .from("suggestions")
          .select("*")
          .eq("id", suggestionId)
          .eq("user_id", resolvedUserId!)
          .single();
        if (sugErr || !suggestion) throw new Error("Sugestão não encontrada");

        // Resolve workspace_id from suggestion if not provided in payload
        if (!workspaceId && suggestion.workspace_id) {
          workspaceId = suggestion.workspace_id;
        }

        const actionData = suggestion.action_data as Record<string, any>;
        // Conversas 2.0: o contato canonico do GHL ja vem na sugestao (multicanal:
        // Instagram/Facebook/WhatsApp). Quando presente, usamos direto e pulamos a
        // resolucao por telefone (legado 1.0/WhatsApp, que quebra sem telefone).
        const directContactId = actionData?.ghl_contact_id as string | undefined;
        const contactPhone = actionData?.contact_phone;
        if (!directContactId && !contactPhone) {
          throw new Error("Sugestão sem contato associado (sem ghl_contact_id nem telefone).");
        }

        // 1. Search contact in GHL by phone (multiple BR formats) then by email
        const cleanPhone = (contactPhone || "").replace(/\D/g, "");
        
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
        const contactEmail = actionData?.contact_email;
        // So busca por telefone/email quando NAO temos o contato canonico (1.0).
        if (!directContactId) {
          for (const variation of uniqueVariations) {
            if (contacts.length > 0) break;
            const result = await callGhl(`/contacts/?query=${encodeURIComponent(variation)}`) as any;
            contacts = result?.contacts || [];
          }
          // Also try searching by email if available
          if (contacts.length === 0 && contactEmail) {
            console.log(`Phone not found, trying email: ${contactEmail}`);
            const emailResult = await callGhl(`/contacts/?query=${encodeURIComponent(contactEmail)}`) as any;
            contacts = emailResult?.contacts || [];
          }
        }

        let contactCreated = false;
        let contactId: string;
        let contact: any;
        const creds = await getGhlCredentials();

        // Check creation permissions from integration config
        let cfgQ = supabase.from("integrations").select("config").eq("user_id", resolvedUserId!).eq("type", "ghl");
        if (workspaceId) cfgQ = cfgQ.eq("workspace_id", workspaceId);
        const { data: cfgData } = await cfgQ.single();
        const ghlConfig = (cfgData?.config || {}) as Record<string, any>;
        const allowCreateContact = ghlConfig.allowCreateContact !== false; // default true
        const allowCreateOpportunity = ghlConfig.allowCreateOpportunity !== false; // default true

        if (directContactId) {
          // Conversas 2.0: usa o contato do GHL direto (qualquer canal).
          contactId = directContactId;
          try {
            const existing = await callGhl(`/contacts/${contactId}`, "GET", undefined, true) as any;
            contact = existing?.contact || existing || { id: contactId };
          } catch {
            contact = { id: contactId };
          }
          console.log(`Using GHL contact from suggestion (2.0): ${contactId}`);
        } else if (contacts.length === 0) {
          if (!allowCreateContact) {
            // Don't create - save alert and return
            console.log("Contact not found and creation disabled by user config");
            await supabase.from("suggestions").update({
              status: "approved",
              action_data: {
                ...actionData,
                executed: false,
                execution_result: "Contato não encontrado no CRM.",
                not_found_contact: true,
                executed_at: new Date().toISOString(),
              },
            }).eq("id", suggestionId);

            return new Response(JSON.stringify({
              success: true,
              data: {
                message: "⚠️ Contato não encontrado no CRM. A criação automática está desativada.",
                notFoundContact: true,
              },
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Create the contact in GHL
          console.log(`Contact not found, creating new contact for phone: ${contactPhone}`);
          const formattedPhone = baseNumber.length >= 10 ? `+55${baseNumber}` : contactPhone;
          const contactName = actionData?.contact_name || `Lead ${formattedPhone}`;

          try {
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
          } catch (createErr: any) {
            const errMsg = createErr?.message || "";
            const dupMatch = errMsg.match(/"contactId"\s*:\s*"([^"]+)"/);
            if (dupMatch && dupMatch[1]) {
              contactId = dupMatch[1];
              console.log(`Duplicate contact detected, using existing contactId: ${contactId}`);
              try {
                const existingContact = await callGhl(`/contacts/${contactId}`, "GET", undefined, true) as any;
                contact = existingContact?.contact || existingContact || { id: contactId };
              } catch {
                contact = { id: contactId };
              }
            } else {
              throw createErr;
            }
          }
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
          opportunity = opportunities.sort((a: any, b: any) => 
            new Date(b.createdAt || b.dateAdded || 0).getTime() - new Date(a.createdAt || a.dateAdded || 0).getTime()
          )[0];
          console.log(`Found existing opportunity: ${opportunity.id}`);
        } else {
          if (!allowCreateOpportunity) {
            console.log("Opportunity not found and creation disabled by user config");
            await supabase.from("suggestions").update({
              status: "approved",
              action_data: {
                ...actionData,
                executed: false,
                execution_result: "Oportunidade não encontrada no CRM.",
                not_found_opportunity: true,
                ghl_contact_id: contactId,
                contact_created: contactCreated,
                executed_at: new Date().toISOString(),
              },
            }).eq("id", suggestionId);

            return new Response(JSON.stringify({
              success: true,
              data: {
                message: "⚠️ Oportunidade não encontrada no CRM. A criação automática está desativada.",
                notFoundOpportunity: true,
                contactCreated,
              },
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

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

          if (newOpp?.__duplicateError) {
            console.log("Duplicate on create, re-searching opportunities...");
            const retryOpps = await callGhl(`/opportunities/search?location_id=${creds.locationId}&contact_id=${contactId}`, "GET", undefined, true) as any;
            const retryList = retryOpps?.opportunities || [];
            if (retryList.length > 0) {
              opportunity = retryList.sort((a: any, b: any) =>
                new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
              )[0];
              console.log(`Found existing opportunity after duplicate: ${opportunity.id}`);
            } else {
              throw new Error("Não foi possível criar oportunidade: duplicata detectada mas nenhuma oportunidade encontrada.");
            }
          } else {
            opportunity = newOpp?.opportunity || newOpp;
            opportunityCreated = true;
            console.log(`Created new opportunity: ${opportunity?.id}`);
          }
        }

        if (!opportunity?.id) throw new Error("Falha ao obter oportunidade.");

        // 3. Execute the action based on suggestion type
        let executionResult = "";
        const suggestionType = suggestion.type;

        switch (suggestionType) {
          case "mover_funil": {
            const targetStageName = actionData?.value;
            if (!targetStageName) throw new Error("Etapa de destino não especificada na sugestão.");
            
            // Get selected stages from user config to restrict to allowed pipelines
            let stageQ = supabase
              .from("integrations")
              .select("config")
              .eq("user_id", resolvedUserId!)
              .eq("type", "ghl");
            if (workspaceId) stageQ = stageQ.eq("workspace_id", workspaceId);
            const { data: ghlIntConfig } = await stageQ.single();
            const ghlCfg = (ghlIntConfig?.config || {}) as Record<string, any>;
            const configSelectedStages = (ghlCfg.selectedStages || []) as Array<{ id: string; name: string; pipelineId: string; pipelineName: string }>;
            
            // Build set of allowed pipeline IDs from selected stages
            const allowedPipelineIds = new Set(configSelectedStages.map(s => s.pipelineId));
            const allowedStageIds = new Set(configSelectedStages.map(s => s.id));
            
            // First try to find among selected stages directly (best match)
            const searchName = targetStageName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            let matchedConfigStage = configSelectedStages.find(s => {
              const sn = s.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              return sn === searchName;
            });
            if (!matchedConfigStage) {
              matchedConfigStage = configSelectedStages.find(s => {
                const sn = s.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return sn.includes(searchName) || searchName.includes(sn);
              });
            }
            
            let targetStageId: string;
            let targetPipelineId: string;
            
            if (matchedConfigStage) {
              targetStageId = matchedConfigStage.id;
              targetPipelineId = matchedConfigStage.pipelineId;
              console.log(`Matched configured stage: "${matchedConfigStage.name}" in pipeline "${matchedConfigStage.pipelineName}"`);
            } else {
              // Fallback: search GHL pipelines but ONLY within allowed pipelines
              const pipelinesData = await callGhl("/opportunities/pipelines") as any;
              let targetStage: any = null;
              const allowedStages: string[] = [];
              
              for (const p of (pipelinesData?.pipelines || [])) {
                if (!allowedPipelineIds.has(p.id)) continue; // Skip non-allowed pipelines
                for (const s of (p.stages || [])) {
                  allowedStages.push(`${s.name} (${p.name})`);
                  const stageName = s.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                  if (stageName === searchName || stageName.includes(searchName) || searchName.includes(stageName)) {
                    targetStage = s;
                    targetPipelineId = p.id;
                    break;
                  }
                }
                if (targetStage) break;
              }
              
              if (!targetStage) {
                const configStageNames = configSelectedStages.map(s => `"${s.name}" (${s.pipelineName})`).join(", ");
                console.error(`Stage "${targetStageName}" not found in allowed pipelines. Allowed: ${configStageNames}`);
                throw new Error(`Etapa "${targetStageName}" não encontrada nos funis configurados. Etapas permitidas: ${configStageNames}`);
              }
              
              targetStageId = targetStage.id;
              targetPipelineId = targetPipelineId!;
            }
            
            const moveResult = await callGhl(`/opportunities/${opportunity.id}`, "PUT", {
              pipelineId: targetPipelineId,
              pipelineStageId: targetStageId,
            }, true) as any;

            if (moveResult?.__duplicateError || moveResult?.__invalidStageError) {
              // The contact likely has another opportunity in the target pipeline
              // Search for it and update that one instead
              console.log("Move failed (duplicate/invalid stage), searching for opportunity in target pipeline...");
              const searchOpps = await callGhl(`/opportunities/search?location_id=${creds.locationId}&contact_id=${contactId}&pipeline_id=${targetPipelineId}`, "GET", undefined, true) as any;
              const targetOpps = (searchOpps?.opportunities || []).filter((o: any) => o.pipelineId === targetPipelineId);
              
              if (targetOpps.length > 0) {
                const targetOpp = targetOpps.sort((a: any, b: any) =>
                  new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
                )[0];
                console.log(`Found opportunity ${targetOpp.id} in target pipeline, updating stage...`);
                const stageUpdate = await callGhl(`/opportunities/${targetOpp.id}`, "PUT", {
                  pipelineStageId: targetStageId,
                }, true) as any;
                if (stageUpdate?.__invalidStageError || stageUpdate?.__duplicateError) {
                  throw new Error(`Não foi possível mover o lead para "${targetStageName}". Verifique se a etapa existe no funil correto.`);
                }
                // Update the opportunity reference for the result
                opportunity = targetOpp;
              } else {
                // No opportunity in target pipeline, try just stageId on current opportunity
                const retryResult = await callGhl(`/opportunities/${opportunity.id}`, "PUT", {
                  pipelineStageId: targetStageId,
                }, true) as any;
                if (retryResult?.__duplicateError || retryResult?.__invalidStageError) {
                  throw new Error(`Não foi possível mover o lead para "${targetStageName}". A etapa pode não pertencer ao funil atual.`);
                }
              }
            }
            executionResult = `Lead movido para a etapa "${targetStageName}"`;
            break;
          }

          case "campo_personalizado": {
            let fieldKey = actionData?.field;
            const fieldValue = actionData?.value;
            if (!fieldKey || !fieldValue) throw new Error("Campo ou valor não especificado na sugestão.");
            
            // Strip "contact." prefix if present
            const isContactPrefixed = fieldKey.startsWith("contact.");
            if (isContactPrefixed) {
              fieldKey = fieldKey.replace(/^contact\./, "");
            }
            
            // Determine if the field is an opportunity-level or contact-level field
            const isOpportunityField = fieldKey.startsWith("opportunity.") || fieldKey.startsWith("opportunity_");
            
            // Standard GHL contact fields that are top-level properties (not customFields)
            const standardContactFields = new Set([
              "firstName", "lastName", "name", "email", "phone",
              "address1", "city", "state", "country", "postalCode",
              "website", "timezone", "dnd", "source", "companyName",
              "dateOfBirth", "gender",
            ]);
            
            if (isOpportunityField) {
              // Update on opportunity using customFields - strip the opportunity. prefix
              const cleanKey = fieldKey.replace(/^opportunity[._]/, "");
              await callGhl(`/opportunities/${opportunity.id}`, "PUT", {
                customFields: [{ key: cleanKey, field_value: fieldValue }],
              }, true);
              console.log(`Updated opportunity custom field: ${cleanKey} = ${fieldValue}`);
            } else if (standardContactFields.has(fieldKey)) {
              // Standard contact field - update as top-level property
              await callGhl(`/contacts/${contactId}`, "PUT", {
                [fieldKey]: fieldValue,
              }, true);
              console.log(`Updated standard contact field: ${fieldKey} = ${fieldValue}`);
            } else {
              // Custom contact field - use customFields array
              await callGhl(`/contacts/${contactId}`, "PUT", {
                customFields: [{ key: fieldKey, field_value: fieldValue }],
              }, true);
              console.log(`Updated contact custom field: ${fieldKey} = ${fieldValue}`);
            }
            const displayKey = isOpportunityField ? fieldKey.replace(/^opportunity[._]/, "") : fieldKey;
            executionResult = `Campo "${displayKey}" atualizado para "${fieldValue}"`;
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
            const updateBody: Record<string, any> = { status };
            
            // If lost, check for lostReasonId from payload or action_data
            if (status === "lost") {
              const lostReasonId = payload.lostReasonId || actionData?.lostReasonId;
              if (lostReasonId) {
                updateBody.lostReasonId = lostReasonId;
              }
            }
            
            await callGhl(`/opportunities/${opportunity.id}`, "PUT", updateBody, true);
            executionResult = `Oportunidade marcada como ${status === "won" ? "ganha" : "perdida"}`;
            break;
          }

          case "agendar_lembrete": {
            const taskTitle = actionData?.task_title || actionData?.value || suggestion.title || "Entrar em contato";
            const taskDescription = actionData?.task_description || suggestion.description || "";
            
            // Calculate due date: use provided date or default to 24h from now.
            // Clamp to "now + 1h" if AI returned a past date (safety guard).
            let dueDate: string;
            const fallback = new Date(Date.now() + 24 * 60 * 60 * 1000);
            if (actionData?.due_date) {
              const parsed = new Date(actionData.due_date);
              if (isNaN(parsed.getTime())) {
                dueDate = fallback.toISOString();
              } else if (parsed.getTime() < Date.now()) {
                // Past date — push to 1h from now to avoid creating expired tasks
                dueDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
              } else {
                dueDate = parsed.toISOString();
              }
            } else {
              dueDate = fallback.toISOString();
            }

            const taskAssignedTo = opportunity?.assignedTo || opportunity?.assigned_to || null;
            const taskBody: Record<string, any> = {
              title: taskTitle,
              body: taskDescription,
              dueDate: dueDate,
              completed: false,
            };
            if (taskAssignedTo) {
              taskBody.assignedTo = taskAssignedTo;
            }
            await callGhl(`/contacts/${contactId}/tasks`, "POST", taskBody, true);
            
            const formattedDate = new Date(dueDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
            executionResult = `Tarefa "${taskTitle}" criada com vencimento em ${formattedDate}`;
            break;
          }

          default:
            executionResult = `Tipo de ação "${suggestionType}" não suportado para execução automática.`;
        }

        // 4. Gather rich context from opportunity and contact
        const assignedTo = opportunity.assignedTo || opportunity.assigned_to || null;
        const opportunityName = opportunity.name || null;
        const pipelineName = opportunity.pipelineName || opportunity.pipeline_name || null;
        const stageName = opportunity.pipelineStageName || opportunity.stageName || opportunity.stage_name || null;
        const monetaryValue = opportunity.monetaryValue ?? opportunity.monetary_value ?? null;
        const opportunityStatus = opportunity.status || null;
        const contactName = contact?.name || contact?.firstName || null;

        // Try to resolve assignedTo name from GHL users
        let assignedToName: string | null = null;
        if (assignedTo) {
          try {
            const userResult = await callGhl(`/users/${assignedTo}`, "GET", undefined, true) as any;
            assignedToName = userResult?.name || userResult?.firstName 
              ? `${userResult.firstName || ""} ${userResult.lastName || ""}`.trim() 
              : assignedTo;
          } catch {
            assignedToName = assignedTo; // fallback to ID
          }
        }

        // 5. Update suggestion with execution result
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
            ghl_assigned_to: assignedToName,
            ghl_opportunity_name: opportunityName,
            ghl_pipeline_name: pipelineName,
            ghl_stage_name: stageName,
            ghl_monetary_value: monetaryValue,
            ghl_opportunity_status: opportunityStatus,
            ghl_location_id: locationId,
            executed_at: new Date().toISOString(),
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
            assignedTo: assignedToName,
            pipelineName,
            stageName,
            opportunityName,
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
    const stack = error instanceof Error ? error.stack : undefined;
    await reportEdgeError("edge:ghl-manage", error);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
