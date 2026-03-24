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
    // Log full payload for debugging (truncated to 2000 chars)
    console.log("Webhook payload:", JSON.stringify(payload).slice(0, 2000));

    // Uazap v2 sends EventType (capitalized) and also event/type in older formats
    const event = payload.EventType || payload.event || payload.type;
    
    // Uazap v2 sends instance token in different places
    const instanceToken = payload.token || payload.instanceToken || payload.instance?.token;

    if (!instanceToken) {
      console.log("No instance token in webhook payload, skipping");
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
      console.log("No matching integration found for token:", instanceToken);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = integration.user_id;
    console.log("Found user:", userId, "Event:", event);

    // Handle connection status changes
    if (event === "status" || event === "connection.update" || event === "status_instance") {
      const status = payload.data?.status || payload.status || payload.instance?.status;
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

    // Handle incoming messages - Uazap v2 uses EventType: "messages"
    if (event === "messages" || event === "messages.upsert" || event === "message") {
      // Uazap v2 format: payload.message is the message object directly
      // Also supports: payload.data.message (older format)
      const message = payload.message || payload.data?.message || payload.data;
      if (!message) {
        console.log("No message object found in payload");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Uazap v2: message.key.remoteJid, message.key.fromMe
      // Also: message.from, message.chatId
      const remoteJid = message.key?.remoteJid || message.from || message.chatId || message.remoteJid || "";
      const isFromMe = message.key?.fromMe ?? message.fromMe ?? false;

      // Extract text content from various formats
      const content =
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        message.message?.imageMessage?.caption ||
        message.message?.videoMessage?.caption ||
        message.message?.documentMessage?.caption ||
        message.body ||
        message.text ||
        message.content ||
        "";

      // Skip if group message (ends with @g.us) or no content/jid
      if (!remoteJid || remoteJid.endsWith("@g.us")) {
        console.log("Skipping: group message or no remoteJid", remoteJid);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!content) {
        console.log("Skipping: no text content in message");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Extract phone number from JID
      const phone = remoteJid.replace("@s.whatsapp.net", "").replace("@g.us", "");
      const contactName = message.pushName || message.notifyName || message.senderName || 
                          payload.chat?.name || payload.chat?.pushName || phone;

      console.log("Processing message:", { phone, contactName, isFromMe, contentPreview: content.slice(0, 50) });

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
            unread_count: isFromMe ? conversation.unread_count : (conversation.unread_count || 0) + 1,
          })
          .eq("id", conversation.id);
      }

      if (conversation) {
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          direction: isFromMe ? "outbound" : "inbound",
          content,
        });

        // Trigger AI analysis for inbound messages (fire-and-forget)
        if (!isFromMe) {
          try {
            const aiUrl = `${SUPABASE_URL}/functions/v1/ai-analyze`;
            fetch(aiUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({
                conversation_id: conversation.id,
                user_id: userId,
              }),
            }).catch((e) => console.error("AI analyze trigger failed:", e));
          } catch (e) {
            console.error("Error triggering AI analysis:", e);
          }
        }

        console.log("Message saved successfully for conversation:", conversation.id);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: acknowledge
    console.log("Unhandled event type:", event);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
