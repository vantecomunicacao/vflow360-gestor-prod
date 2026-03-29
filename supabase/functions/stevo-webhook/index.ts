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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const url = new URL(req.url);
    const integrationId = url.searchParams.get("id");

    if (!integrationId) {
      console.log("No integration ID in webhook URL");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the integration
    const { data: integration } = await supabase
      .from("integrations")
      .select("id, user_id, config")
      .eq("id", integrationId)
      .eq("type", "whatsapp_stevo")
      .single();

    if (!integration) {
      console.log("No matching Stevo integration for ID:", integrationId);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = integration.user_id;

    // Update last_webhook_at in config
    const config = (integration.config as Record<string, unknown>) || {};
    await supabase
      .from("integrations")
      .update({
        config: { ...config, last_webhook_at: new Date().toISOString() },
        status: "connected",
      })
      .eq("id", integration.id);

    let payload = await req.json();
    
    // Handle array wrapper - some webhook systems wrap in array
    if (Array.isArray(payload)) {
      payload = payload[0] || {};
    }
    
    // Handle nested data wrapper
    if (payload.data && typeof payload.data === "object" && !payload.SourceWebMsg) {
      const inner = payload.data;
      if (inner.SourceWebMsg || inner.Message) {
        payload = { ...inner, event: payload.event || inner.event, instanceName: payload.instanceName || inner.instanceName };
      }
    }
    
    console.log("Stevo webhook payload keys:", JSON.stringify(Object.keys(payload)));
    console.log("Stevo webhook event:", payload.event, "instance:", payload.instanceName);
    
    // Log SourceWebMsg structure for debugging
    if (payload.SourceWebMsg) {
      console.log("SourceWebMsg keys:", JSON.stringify(Object.keys(payload.SourceWebMsg)));
      if (payload.SourceWebMsg.key) {
        console.log("SourceWebMsg.key:", JSON.stringify(payload.SourceWebMsg.key));
      }
    } else {
      console.log("No SourceWebMsg, full payload sample:", JSON.stringify(payload).slice(0, 500));
    }

    const event = payload.event;

    // Only handle Message events
    if (event !== "Message") {
      console.log("Stevo: unhandled event:", event);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try multiple paths for source message data
    const sourceMsg = payload.SourceWebMsg || payload.sourceWebMsg || payload;
    const messageData = payload.Message || payload.message || {};

    // Try multiple paths for the key
    const msgKey = sourceMsg?.key || sourceMsg?.Key || payload?.key || payload?.Key;
    
    if (!msgKey) {
      console.log("Stevo: no key found. sourceMsg keys:", JSON.stringify(Object.keys(sourceMsg || {})));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const remoteJID = msgKey.remoteJID || msgKey.remoteJid || msgKey.RemoteJID || "";
    const isFromMe = msgKey.fromMe === true || msgKey.FromMe === true;

    // Skip group messages (groups end with @g.us)
    if (!remoteJID || remoteJID.endsWith("@g.us")) {
      console.log("Stevo: skipping group or empty remoteJID");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract phone/ID - Stevo uses LID format (e.g. 140982486102131@lid) or standard @s.whatsapp.net
    const phone = remoteJID.replace("@s.whatsapp.net", "").replace("@lid", "").replace("@g.us", "");

    // Extract message content
    let content = "";

    // Try various paths for the text content
    content =
      messageData?.conversation ||
      messageData?.extendedTextMessage?.text ||
      sourceMsg?.message?.conversation ||
      sourceMsg?.message?.extendedTextMessage?.text ||
      "";

    // Handle media messages
    if (!content) {
      const msg = sourceMsg?.message || messageData || {};
      if (msg.imageMessage) {
        content = msg.imageMessage.caption
          ? `📷 [Imagem]: ${msg.imageMessage.caption}`
          : "[📷 Imagem recebida]";
      } else if (msg.audioMessage || msg.pttMessage) {
        content = "[🎵 Áudio recebido]";
      } else if (msg.videoMessage) {
        content = msg.videoMessage.caption
          ? `🎬 [Vídeo]: ${msg.videoMessage.caption}`
          : "[Enviado uma mídia não suportada]";
      } else if (msg.documentMessage) {
        content = msg.documentMessage.fileName
          ? `📎 [Documento]: ${msg.documentMessage.fileName}`
          : "[Enviado uma mídia não suportada]";
      } else if (msg.stickerMessage) {
        content = "[🎨 Figurinha recebida]";
      } else if (msg.contactMessage || msg.contactsArrayMessage) {
        content = "[📇 Contato compartilhado]";
      } else if (msg.locationMessage || msg.liveLocationMessage) {
        content = "[📍 Localização compartilhada]";
      }
    }

    if (!content) {
      console.log("Stevo: no content extracted from message");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use pushName or phone as contact name
    const contactName = sourceMsg.pushName || payload.senderName || phone;

    console.log("Stevo processing:", { phone, contactName, isFromMe, content: content.slice(0, 80) });

    // Find or create conversation
    let { data: conversation } = await supabase
      .from("conversations")
      .select("id, unread_count")
      .eq("user_id", userId)
      .eq("contact_phone", phone)
      .single();

    const displayMessage = content.length > 100 ? content.slice(0, 100) + "..." : content;

    // Use messageTimestamp if available
    const msgTimestamp = sourceMsg.messageTimestamp
      ? new Date(sourceMsg.messageTimestamp * 1000).toISOString()
      : new Date().toISOString();

    if (!conversation) {
      const { data: newConv } = await supabase
        .from("conversations")
        .insert({
          user_id: userId,
          contact_name: contactName,
          contact_phone: phone,
          last_message: displayMessage,
          last_message_at: msgTimestamp,
          unread_count: isFromMe ? 0 : 1,
          integration_type: "stevo",
        })
        .select("id, unread_count")
        .single();
      conversation = newConv;
    } else {
      await supabase
        .from("conversations")
        .update({
          last_message: displayMessage,
          last_message_at: msgTimestamp,
          contact_name: contactName,
          unread_count: isFromMe ? conversation.unread_count : (conversation.unread_count || 0) + 1,
          integration_type: "stevo",
        })
        .eq("id", conversation.id);
    }

    if (conversation) {
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        direction: isFromMe ? "outbound" : "inbound",
        content,
        created_at: msgTimestamp,
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

      console.log("Stevo message saved:", conversation.id);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Stevo webhook error:", error);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
