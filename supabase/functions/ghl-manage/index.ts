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
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { action, apiKey, locationId } = await req.json();

    // Helper to get stored GHL credentials
    const getGhlCredentials = async () => {
      const { data: integration } = await supabase
        .from("integrations")
        .select("config")
        .eq("user_id", user.id)
        .eq("type", "ghl")
        .single();
      if (!integration) throw new Error("GHL not connected. Please add your credentials first.");
      const config = integration.config as { apiKey?: string; locationId?: string };
      if (!config.apiKey || !config.locationId) throw new Error("GHL credentials incomplete");
      return config;
    };

    // Helper to call GHL API
    const callGhl = async (endpoint: string, method = "GET", body?: unknown) => {
      const creds = await getGhlCredentials();
      const url = new URL(endpoint, GHL_BASE_URL);
      // Add locationId as query param for endpoints that need it
      if (!url.searchParams.has("locationId")) {
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

      const response = await fetch(url.toString(), options);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(`GHL API error [${response.status}]: ${JSON.stringify(data)}`);
      }
      return data;
    };

    switch (action) {
      case "connect": {
        // Save credentials and test connection
        if (!apiKey || !locationId) throw new Error("API Key and Location ID are required");

        // Test the connection by fetching location info
        const testUrl = new URL("/locations/" + locationId, GHL_BASE_URL);
        const testResponse = await fetch(testUrl.toString(), {
          headers: {
            Authorization: `Bearer ${apiKey}`,
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

        const locationData = await testResponse.json();

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

        const config = integration.config as { locationName?: string };
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
        const { query } = await req.json().catch(() => ({ query: "" }));
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
        const data = await callGhl("/locations/" + (await getGhlCredentials()).locationId + "/customFields");
        return new Response(JSON.stringify({ success: true, data }), {
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
