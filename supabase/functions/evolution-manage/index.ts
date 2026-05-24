import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { reportEdgeError } from "../_shared/error-reporter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function mapState(state: string | undefined | null): "connected" | "disconnected" | "connecting" {
  if (state === "open") return "connected";
  if (state === "connecting") return "connecting";
  return "disconnected";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const EVOLUTION_BASE_URL = (Deno.env.get("EVOLUTION_BASE_URL") || "").replace(/\/+$/, "");
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
    if (!EVOLUTION_BASE_URL) throw new Error("EVOLUTION_BASE_URL is not configured");
    if (!EVOLUTION_API_KEY) throw new Error("EVOLUTION_API_KEY is not configured");

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
    const { action, instanceName, integration_id, label, workspace_id } = await req.json();

    const webhookUrl = `${SUPABASE_URL}/functions/v1/evolution-webhook`;
    const apiHeaders = {
      "Content-Type": "application/json",
      apikey: EVOLUTION_API_KEY,
    };

    async function getIntegration(id?: string) {
      if (id) {
        const { data } = await supabase
          .from("integrations")
          .select("*")
          .eq("id", id)
          .eq("user_id", user.id)
          .eq("type", "whatsapp_evolution")
          .single();
        return data;
      }
      return null;
    }

    switch (action) {
      case "create": {
        const name = instanceName || `vflow-${user.id.slice(0, 8)}-${Date.now().toString(36)}`;
        const response = await fetch(`${EVOLUTION_BASE_URL}/instance/create`, {
          method: "POST",
          headers: apiHeaders,
          body: JSON.stringify({
            instanceName: name,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS",
            webhook: {
              url: webhookUrl,
              byEvents: false,
              base64: true,
              events: [
                "MESSAGES_UPSERT",
                "CONNECTION_UPDATE",
                "QRCODE_UPDATED",
              ],
            },
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(`Evolution create failed [${response.status}]: ${JSON.stringify(data)}`);
        }

        const instanceToken: string =
          data?.hash?.apikey || data?.hash || data?.instance?.apikey || EVOLUTION_API_KEY;
        const qr = data?.qrcode?.base64 || data?.qrcode?.code || null;

        const { data: inserted, error: insertErr } = await supabase
          .from("integrations")
          .insert({
            user_id: user.id,
            workspace_id: workspace_id || null,
            type: "whatsapp_evolution",
            config: {
              instanceName: name,
              instanceId: data?.instance?.instanceId || null,
              token: instanceToken,
              label: label || `Evolution ${name.slice(-4)}`,
            },
            status: "connecting",
          })
          .select()
          .single();

        if (insertErr) throw new Error(`Failed to save integration: ${insertErr.message}`);

        return new Response(
          JSON.stringify({
            success: true,
            data: { ...data, qrcode: qr, integration_id: inserted.id, instanceName: name },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "connect":
      case "qrcode": {
        const integration = await getIntegration(integration_id);
        if (!integration) throw new Error("Evolution instance not found");
        const cfg = integration.config as { instanceName?: string };
        if (!cfg.instanceName) throw new Error("Missing instanceName in config");

        const response = await fetch(
          `${EVOLUTION_BASE_URL}/instance/connect/${encodeURIComponent(cfg.instanceName)}`,
          { method: "GET", headers: apiHeaders },
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(`Evolution connect failed [${response.status}]: ${JSON.stringify(data)}`);
        }

        const qr = data?.base64 || data?.qrcode || data?.code || null;
        await supabase.from("integrations").update({ status: "connecting" }).eq("id", integration.id);

        return new Response(JSON.stringify({ success: true, data: { qrcode: qr, ...data } }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "status": {
        if (integration_id) {
          const integration = await getIntegration(integration_id);
          if (!integration) {
            return new Response(
              JSON.stringify({ success: true, data: { status: "not_created" } }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          const cfg = integration.config as { instanceName?: string };
          if (!cfg.instanceName) {
            return new Response(
              JSON.stringify({ success: true, data: { status: "not_created" } }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }

          const response = await fetch(
            `${EVOLUTION_BASE_URL}/instance/connectionState/${encodeURIComponent(cfg.instanceName)}`,
            { method: "GET", headers: apiHeaders },
          );
          const data = await response.json();
          const newStatus = mapState(data?.instance?.state || data?.state);

          if (newStatus !== integration.status) {
            await supabase.from("integrations").update({ status: newStatus }).eq("id", integration.id);
          }

          // If still connecting, try to refresh QR
          let qr = null;
          if (newStatus === "connecting") {
            try {
              const qrResp = await fetch(
                `${EVOLUTION_BASE_URL}/instance/connect/${encodeURIComponent(cfg.instanceName)}`,
                { method: "GET", headers: apiHeaders },
              );
              if (qrResp.ok) {
                const qrData = await qrResp.json();
                qr = qrData?.base64 || qrData?.qrcode || qrData?.code || null;
              }
            } catch { /* ignore */ }
          }

          return new Response(
            JSON.stringify({ success: true, data: { status: newStatus, qrcode: qr, instance: data?.instance } }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // List all Evolution instances for this user
        const query = supabase
          .from("integrations")
          .select("*")
          .eq("user_id", user.id)
          .eq("type", "whatsapp_evolution")
          .order("created_at", { ascending: true });
        if (workspace_id) query.eq("workspace_id", workspace_id);
        const { data: allIntegrations } = await query;

        if (!allIntegrations || allIntegrations.length === 0) {
          return new Response(
            JSON.stringify({ success: true, data: { status: "not_created", instances: [] } }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        const instances = [];
        for (const int of allIntegrations) {
          const config = int.config as { instanceName?: string; label?: string; ghl_user_id?: string };
          let instanceStatus = (int.status as string) || "disconnected";

          if (config.instanceName) {
            try {
              const resp = await fetch(
                `${EVOLUTION_BASE_URL}/instance/connectionState/${encodeURIComponent(config.instanceName)}`,
                { method: "GET", headers: apiHeaders },
              );
              if (resp.ok) {
                const statusData = await resp.json();
                instanceStatus = mapState(statusData?.instance?.state || statusData?.state);
                if (instanceStatus !== int.status) {
                  await supabase
                    .from("integrations")
                    .update({ status: instanceStatus })
                    .eq("id", int.id);
                }
              }
            } catch { /* keep existing */ }
          }

          instances.push({
            id: int.id,
            instanceName: config.instanceName,
            label: config.label || config.instanceName || "Evolution",
            status: instanceStatus,
            ghl_user_id: config.ghl_user_id || null,
          });
        }

        const anyConnected = instances.some((i) => i.status === "connected");
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              status: instances.length === 0 ? "not_created" : anyConnected ? "connected" : "disconnected",
              instances,
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "disconnect": {
        const integration = await getIntegration(integration_id);
        if (!integration) throw new Error("Evolution instance not found");
        const cfg = integration.config as { instanceName?: string };
        if (!cfg.instanceName) throw new Error("Missing instanceName");

        const response = await fetch(
          `${EVOLUTION_BASE_URL}/instance/logout/${encodeURIComponent(cfg.instanceName)}`,
          { method: "DELETE", headers: apiHeaders },
        );
        const data = await response.json().catch(() => ({}));

        await supabase
          .from("integrations")
          .update({ status: "disconnected" })
          .eq("id", integration.id);

        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete": {
        const integration = await getIntegration(integration_id);
        if (!integration) throw new Error("Evolution instance not found");
        const cfg = integration.config as { instanceName?: string };

        if (cfg.instanceName) {
          // Try to logout first, then delete
          try {
            await fetch(`${EVOLUTION_BASE_URL}/instance/logout/${encodeURIComponent(cfg.instanceName)}`, {
              method: "DELETE",
              headers: apiHeaders,
            });
          } catch { /* ignore */ }
          try {
            await fetch(`${EVOLUTION_BASE_URL}/instance/delete/${encodeURIComponent(cfg.instanceName)}`, {
              method: "DELETE",
              headers: apiHeaders,
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
        if (!integration) throw new Error("Evolution instance not found");

        const config = integration.config as Record<string, unknown>;
        await supabase
          .from("integrations")
          .update({ config: { ...config, label } })
          .eq("id", integration.id);

        return new Response(JSON.stringify({ success: true, data: { updated: true } }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error("evolution-manage error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    await reportEdgeError("edge:evolution-manage", error);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
