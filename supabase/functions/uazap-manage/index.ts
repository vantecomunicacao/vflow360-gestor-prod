import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { reportEdgeError } from "../_shared/error-reporter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// TEMP: Uazap desabilitado por enquanto (estava gerando muitos erros).
// Para reativar: defina a env UAZAP_ENABLED="true".
const UAZAP_ENABLED = Deno.env.get("UAZAP_ENABLED") === "true";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Kill-switch: responde de forma benigna e NÃO reporta erros enquanto desabilitado.
  if (!UAZAP_ENABLED) {
    return new Response(
      JSON.stringify({ success: true, disabled: true, data: { status: "not_created", instances: [] } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const UAZAP_ADMIN_TOKEN = Deno.env.get("UAZAP_ADMIN_TOKEN");
    if (!UAZAP_ADMIN_TOKEN) throw new Error("UAZAP_ADMIN_TOKEN is not configured");

    const UAZAP_SUBDOMAIN = Deno.env.get("UAZAP_SUBDOMAIN");
    if (!UAZAP_SUBDOMAIN) throw new Error("UAZAP_SUBDOMAIN is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Missing authorization header");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) throw new Error("Unauthorized");

    const user = { id: claimsData.claims.sub as string };

    const BASE_URL = `https://${UAZAP_SUBDOMAIN}.uazapi.com`;
    const { action, instanceName, integration_id, label } = await req.json();

    // Helper to get integration by ID or fallback to first whatsapp
    async function getIntegration(id?: string) {
      if (id) {
        const { data } = await supabase
          .from("integrations")
          .select("*")
          .eq("id", id)
          .eq("user_id", user!.id)
          .eq("type", "whatsapp")
          .single();
        return data;
      }
      // Fallback: get first (for backward compat)
      const { data } = await supabase
        .from("integrations")
        .select("*")
        .eq("user_id", user!.id)
        .eq("type", "whatsapp")
        .order("created_at", { ascending: true })
        .limit(1)
        .single();
      return data;
    }

    switch (action) {
      case "create": {
        const name = instanceName || `copiloto-${user.id.slice(0, 8)}-${Date.now().toString(36)}`;
        const response = await fetch(`${BASE_URL}/instance/create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            admintoken: UAZAP_ADMIN_TOKEN,
          },
          body: JSON.stringify({ name, instanceName: name }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(`Uazap create failed [${response.status}]: ${JSON.stringify(data)}`);
        }

        const { data: inserted, error: insertErr } = await supabase.from("integrations").insert({
          user_id: user.id,
          type: "whatsapp",
          config: {
            instanceName: name,
            token: data.token || data.instance?.token,
            instanceId: data.instance?.id || data.id,
            label: label || `WhatsApp ${name.slice(-4)}`,
          },
          status: "disconnected",
        }).select().single();

        if (insertErr) throw new Error(`Failed to save integration: ${insertErr.message}`);

        return new Response(JSON.stringify({ success: true, data: { ...data, integration_id: inserted.id } }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "connect": {
        const integration = await getIntegration(integration_id);
        if (!integration) throw new Error("No WhatsApp instance found. Create one first.");

        const config = integration.config as { token?: string };
        if (!config.token) throw new Error("Instance token not found");

        const response = await fetch(`${BASE_URL}/instance/connect`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            token: config.token,
          },
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(`Uazap connect failed [${response.status}]: ${JSON.stringify(data)}`);
        }

        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "qrcode":
      case "status": {
        // If integration_id provided, get that specific one
        if (integration_id) {
          const integration = await getIntegration(integration_id);
          if (!integration) {
            return new Response(JSON.stringify({ success: true, data: { status: "not_created" } }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const config = integration.config as { token?: string };
          if (!config.token) {
            return new Response(JSON.stringify({ success: true, data: { status: "not_created" } }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const response = await fetch(`${BASE_URL}/instance/status`, {
            method: "GET",
            headers: { token: config.token },
          });
          const data = await response.json();

          const newStatus = data.status === "connected" ? "connected" : "disconnected";
          if (newStatus !== integration.status) {
            await supabase.from("integrations").update({ status: newStatus }).eq("id", integration.id);
          }

          return new Response(JSON.stringify({ success: true, data }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // List all WhatsApp instances for this user
        const { data: allIntegrations } = await supabase
          .from("integrations")
          .select("*")
          .eq("user_id", user.id)
          .eq("type", "whatsapp")
          .order("created_at", { ascending: true });

        if (!allIntegrations || allIntegrations.length === 0) {
          return new Response(JSON.stringify({ success: true, data: { status: "not_created", instances: [] } }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check status for each instance
        const instances = [];
        for (const int of allIntegrations) {
          const config = int.config as { token?: string; instanceName?: string; label?: string };
          let instanceStatus = int.status || "disconnected";

          if (config.token) {
            try {
              const resp = await fetch(`${BASE_URL}/instance/status`, {
                method: "GET",
                headers: { token: config.token },
              });
              const statusData = await resp.json();
              instanceStatus = statusData.status === "connected" ? "connected" : "disconnected";
              if (instanceStatus !== int.status) {
                await supabase.from("integrations").update({ status: instanceStatus }).eq("id", int.id);
              }
            } catch {
              // keep existing status
            }
          }

          instances.push({
            id: int.id,
            instanceName: config.instanceName,
            label: config.label || config.instanceName || "WhatsApp",
            status: instanceStatus,
          });
        }

        // For backward compat, also return top-level status
        const anyConnected = instances.some(i => i.status === "connected");
        return new Response(JSON.stringify({
          success: true,
          data: {
            status: instances.length === 0 ? "not_created" : anyConnected ? "connected" : "disconnected",
            instances,
          },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "disconnect": {
        const integration = await getIntegration(integration_id);
        if (!integration) throw new Error("No WhatsApp instance found.");
        const config = integration.config as { token?: string };
        if (!config.token) throw new Error("Instance token not found");

        const response = await fetch(`${BASE_URL}/instance/disconnect`, {
          method: "POST",
          headers: { token: config.token },
        });
        const data = await response.json();

        await supabase.from("integrations").update({ status: "disconnected" }).eq("id", integration.id);

        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete": {
        const integration = await getIntegration(integration_id);
        if (!integration) throw new Error("No WhatsApp instance found.");
        const config = integration.config as { token?: string };

        // Try to disconnect first
        if (config.token) {
          try {
            await fetch(`${BASE_URL}/instance/disconnect`, {
              method: "POST",
              headers: { token: config.token },
            });
          } catch { /* ignore */ }
        }

        await supabase.from("integrations").delete().eq("id", integration.id);

        return new Response(JSON.stringify({ success: true, data: { deleted: true } }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update_label": {
        if (!integration_id || !label) throw new Error("integration_id and label are required");
        const integration = await getIntegration(integration_id);
        if (!integration) throw new Error("No WhatsApp instance found.");

        const config = integration.config as Record<string, unknown>;
        await supabase.from("integrations").update({
          config: { ...config, label },
        }).eq("id", integration.id);

        return new Response(JSON.stringify({ success: true, data: { updated: true } }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error("uazap-manage error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    await reportEdgeError("edge:uazap-manage", error);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
