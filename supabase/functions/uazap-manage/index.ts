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
    const UAZAP_ADMIN_TOKEN = Deno.env.get("UAZAP_ADMIN_TOKEN");
    if (!UAZAP_ADMIN_TOKEN) throw new Error("UAZAP_ADMIN_TOKEN is not configured");

    const UAZAP_SUBDOMAIN = Deno.env.get("UAZAP_SUBDOMAIN");
    if (!UAZAP_SUBDOMAIN) throw new Error("UAZAP_SUBDOMAIN is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    
    // Create a client with the user's token to verify identity
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const BASE_URL = `https://${UAZAP_SUBDOMAIN}.uazapi.com`;
    const { action, instanceName } = await req.json();

    switch (action) {
      case "create": {
        // Create a new instance for this user
        const name = instanceName || `copiloto-${user.id.slice(0, 8)}`;
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

        // Save instance token in integrations table
        await supabase.from("integrations").upsert(
          {
            user_id: user.id,
            type: "whatsapp",
            config: { instanceName: name, token: data.token || data.instance?.token, instanceId: data.instance?.id || data.id },
            status: "disconnected",
          },
          { onConflict: "user_id,type" }
        );

        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "connect": {
        // Get the user's integration to find their instance token
        const { data: integration } = await supabase
          .from("integrations")
          .select("config")
          .eq("user_id", user.id)
          .eq("type", "whatsapp")
          .single();

        if (!integration) throw new Error("No WhatsApp instance found. Create one first.");

        const config = integration.config as { token?: string; instanceName?: string };
        if (!config.token) throw new Error("Instance token not found");

        const response = await fetch(`${BASE_URL}/instance/connect`, {
          method: "GET",
          headers: { token: config.token },
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(`Uazap connect failed [${response.status}]: ${JSON.stringify(data)}`);
        }

        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "qrcode": {
        const { data: integration } = await supabase
          .from("integrations")
          .select("config")
          .eq("user_id", user.id)
          .eq("type", "whatsapp")
          .single();

        if (!integration) throw new Error("No WhatsApp instance found.");
        const config = integration.config as { token?: string };
        if (!config.token) throw new Error("Instance token not found");

        const response = await fetch(`${BASE_URL}/instance/qrcode`, {
          method: "GET",
          headers: { token: config.token },
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(`Uazap qrcode failed [${response.status}]: ${JSON.stringify(data)}`);
        }

        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "status": {
        const { data: integration } = await supabase
          .from("integrations")
          .select("config, status")
          .eq("user_id", user.id)
          .eq("type", "whatsapp")
          .single();

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

        // Update status in DB
        const newStatus = data.status === "connected" ? "connected" : "disconnected";
        if (newStatus !== integration.status) {
          await supabase
            .from("integrations")
            .update({ status: newStatus })
            .eq("user_id", user.id)
            .eq("type", "whatsapp");
        }

        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "disconnect": {
        const { data: integration } = await supabase
          .from("integrations")
          .select("config")
          .eq("user_id", user.id)
          .eq("type", "whatsapp")
          .single();

        if (!integration) throw new Error("No WhatsApp instance found.");
        const config = integration.config as { token?: string };
        if (!config.token) throw new Error("Instance token not found");

        const response = await fetch(`${BASE_URL}/instance/disconnect`, {
          method: "POST",
          headers: { token: config.token },
        });
        const data = await response.json();

        await supabase
          .from("integrations")
          .update({ status: "disconnected" })
          .eq("user_id", user.id)
          .eq("type", "whatsapp");

        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error("uazap-manage error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
