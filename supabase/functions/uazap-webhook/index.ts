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
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const payload = await req.json();
    console.log("Webhook received:", JSON.stringify(payload).slice(0, 500));

    // Uazap sends different event types
    const event = payload.event || payload.type;
    const instanceToken = payload.token || payload.instanceToken;

    if (!instanceToken) {
      console.log("No instance token in webhook payload");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find which user owns this instance
    const { data: integrations } = await supabase
      .from("integrations")
      .select("user_id, config")
      .eq("type", "whatsapp");

    const integration = integrations?.find((i) => {
      const config = i.config as { token?: string };
      return config.token === instanceToken;
    });

    if (!integration) {
      console.log("No matching integration found for token");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = integration.user_id;

    // Handle connection status changes
    if (event === "status" || event === "connection.update") {
      const status = payload.data?.status || payload.status;
      if (status) {
        await supabase
          .from("integrations")
          .update({ status: status === "connected" ? "connected" : "disconnected" })
          .eq("user_id", userId)
          .eq("type", "whatsapp");
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle incoming messages
    if (event === "messages.upsert" || event === "message" || event === "messages") {
      const message = payload.data?.message || payload.message || payload.data;
      if (!message) {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const remoteJid = message.key?.remoteJid || message.from || message.chatId || "";
      const isFromMe = message.key?.fromMe || false;
      const content =
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        message.body ||
        message.text ||
        "";

      if (!content || !remoteJid) {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Extract phone number from JID
      const phone = remoteJid.replace("@s.whatsapp.net", "").replace("@g.us", "");
      const contactName = message.pushName || message.notifyName || phone;

      // Find or create conversation
      let { data: conversation } = await supabase
        .from("conversations")
        .select("id, unread_count")
        .eq("user_id", userId)
        .eq("contact_phone", phone)
        .single();

      if (!conversation) {
        const { data: newConv } = await supabase
          .from("conversations")
          .insert({
            user_id: userId,
            contact_name: contactName,
            contact_phone: phone,
            last_message: content,
            last_message_at: new Date().toISOString(),
            unread_count: isFromMe ? 0 : 1,
          })
          .select("id, unread_count")
          .single();
        conversation = newConv;
      } else {
        await supabase
          .from("conversations")
          .update({
            last_message: content,
            last_message_at: new Date().toISOString(),
            contact_name: contactName,
            unread_count: isFromMe ? conversation.unread_count : conversation.unread_count + 1,
          })
          .eq("id", conversation.id);
      }

      if (conversation) {
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          direction: isFromMe ? "outbound" : "inbound",
          content,
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: acknowledge
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, // Always return 200 to webhooks
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
