import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Find conversations where analyze_after has passed and analysis hasn't been done yet
    const { data: ready, error } = await supabase
      .from("conversations")
      .select("id, user_id, analyze_after")
      .not("analyze_after", "is", null)
      .lte("analyze_after", new Date().toISOString())
      .order("analyze_after", { ascending: true })
      .limit(10);

    if (error) {
      console.error("Error fetching ready conversations:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ready || ready.length === 0) {
      return new Response(JSON.stringify({ triggered: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${ready.length} conversations ready for analysis`);

    // Trigger analysis for each ready conversation
    const results = await Promise.allSettled(
      ready.map(async (conv) => {
        // Clear analyze_after first to prevent re-triggering
        await supabase
          .from("conversations")
          .update({ analyze_after: null })
          .eq("id", conv.id)
          .eq("analyze_after", conv.analyze_after); // optimistic lock

        const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            conversation_id: conv.id,
            user_id: conv.user_id,
          }),
        });

        const body = await resp.text();
        console.log(`Triggered analysis for ${conv.id}: ${resp.status}`);
        return { id: conv.id, status: resp.status };
      })
    );

    return new Response(
      JSON.stringify({ triggered: ready.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Scheduler error:", err);
    try {
      await fetch("https://n8n-webhook.boliqf.easypanel.host/webhook/erro-lovable", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: "VFlowGHL", level: "error", source: "edge:analyze-scheduler", message: String(err), stack: (err as Error)?.stack, timestamp: new Date().toISOString() }),
      });
    } catch (_) {}
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
