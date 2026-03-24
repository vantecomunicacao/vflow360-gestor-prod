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
    console.log("Webhook event:", payload.EventType || payload.event, "instance:", payload.instanceName);

    const event = payload.EventType || payload.event || payload.type;

    // Find the user by instanceName or token
    const instanceName = payload.instanceName;
    const instanceToken = payload.token || payload.instanceToken;

    const { data: integrations } = await supabase
      .from("integrations")
      .select("user_id, config")
      .eq("type", "whatsapp");

    const integration = integrations?.find((i) => {
      const config = i.config as { token?: string; instanceName?: string };
      if (instanceName && config.instanceName === instanceName) return true;
      if (instanceToken && config.token === instanceToken) return true;
      return false;
    });

    if (!integration) {
      console.log("No matching integration for instance:", instanceName || instanceToken);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = integration.user_id;

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

    // Handle incoming messages
    if (event === "messages" || event === "messages.upsert" || event === "message") {
      const message = payload.message;
      const chat = payload.chat;

      if (!message && !chat) {
        console.log("No message/chat in payload");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Uazap v2: chatid is in message.chatid or chat.wa_chatid
      const chatId = message?.chatid || chat?.wa_chatid || message?.key?.remoteJid || "";

      // Skip group messages
      if (!chatId || chatId.endsWith("@g.us") || chat?.wa_isGroup) {
        console.log("Skipping: group or no chatId");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const isFromMe = message?.fromMe ?? message?.key?.fromMe ?? false;

      // Extract text - content can be string or object {text: "..."}
      let content = "";
      const rawContent = message?.content;
      if (typeof rawContent === "string") {
        content = rawContent;
      } else if (rawContent && typeof rawContent === "object") {
        content = rawContent.text || rawContent.conversation || "";
      }
      // Fallback to other fields
      if (!content) {
        content = message?.body || message?.text || 
                  message?.message?.conversation || 
                  message?.message?.extendedTextMessage?.text || 
                  chat?.wa_lastMessageTextVote || "";
      }

      if (!content) {
        console.log("Skipping: no text content");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Extract phone from chatId
      const phone = chatId.replace("@s.whatsapp.net", "").replace("@g.us", "");
      const contactName = chat?.name || chat?.wa_name || message?.pushName || phone;

      console.log("Processing:", { phone, contactName, isFromMe, content: content.slice(0, 80) });

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
          fetch(`${SUPABASE_URL}/functions/v1/ai-analyze`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ conversation_id: conversation.id, user_id: userId }),
          }).catch((e) => console.error("AI analyze trigger failed:", e));
        }

        console.log("Message saved:", conversation.id);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Unhandled event:", event);
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
