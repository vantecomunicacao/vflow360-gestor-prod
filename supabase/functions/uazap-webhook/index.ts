import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Transcribe audio using Lovable AI (Gemini with audio support)
async function transcribeAudio(mediaUrl: string, apiKey: string): Promise<string> {
  try {
    // Download the audio file
    const mediaResp = await fetch(mediaUrl);
    if (!mediaResp.ok) {
      console.error("Failed to download audio:", mediaResp.status);
      return "[🎵 Áudio recebido - não foi possível transcrever]";
    }
    const audioBuffer = await mediaResp.arrayBuffer();
    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));
    const contentType = mediaResp.headers.get("content-type") || "audio/ogg";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Transcreva este áudio em português. Retorne APENAS o texto transcrito, sem explicações adicionais. Se não conseguir entender, diga '[Áudio inaudível]'." },
              {
                type: "input_audio",
                input_audio: {
                  data: base64Audio,
                  format: contentType.includes("ogg") ? "ogg" : contentType.includes("mp4") || contentType.includes("m4a") ? "m4a" : "mp3",
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI transcription error:", response.status);
      return "[🎵 Áudio recebido - não foi possível transcrever]";
    }

    const data = await response.json();
    const transcription = data.choices?.[0]?.message?.content?.trim();
    return transcription ? `🎵 [Áudio]: ${transcription}` : "[🎵 Áudio recebido - não foi possível transcrever]";
  } catch (e) {
    console.error("Audio transcription failed:", e);
    return "[🎵 Áudio recebido - não foi possível transcrever]";
  }
}

// Describe image using Lovable AI (Gemini vision)
async function describeImage(mediaUrl: string, apiKey: string): Promise<string> {
  try {
    const mediaResp = await fetch(mediaUrl);
    if (!mediaResp.ok) {
      console.error("Failed to download image:", mediaResp.status);
      return "[📷 Imagem recebida - não foi possível analisar]";
    }
    const imageBuffer = await mediaResp.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
    const contentType = mediaResp.headers.get("content-type") || "image/jpeg";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Descreva esta imagem de forma objetiva e concisa em português. Se houver texto na imagem, transcreva-o. Se for um documento, descreva o conteúdo. Se for um print de tela, descreva o que aparece. Retorne APENAS a descrição." },
              {
                type: "image_url",
                image_url: {
                  url: `data:${contentType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI image description error:", response.status);
      return "[📷 Imagem recebida - não foi possível analisar]";
    }

    const data = await response.json();
    const description = data.choices?.[0]?.message?.content?.trim();
    return description ? `📷 [Imagem]: ${description}` : "[📷 Imagem recebida - não foi possível analisar]";
  } catch (e) {
    console.error("Image description failed:", e);
    return "[📷 Imagem recebida - não foi possível analisar]";
  }
}

// Detect media type and extract URL from Uazap payload
function extractMedia(message: any): { type: string; url: string; base64?: string; mimetype?: string } | null {
  if (!message) return null;

  const mimeType = message.mimetype || message.mediaType || message.media?.mimetype || "";
  const msgType = message.type || "";

  // Determine media type from mimetype or message type
  function detectType(mime: string, type: string): string {
    if (mime.startsWith("audio/") || type === "audio" || type === "ptt") return "audio";
    if (mime.startsWith("image/") || type === "image") return "image";
    if (mime.startsWith("video/") || type === "video") return "video";
    if (mime.startsWith("application/") || type === "document") return "document";
    if (type === "sticker") return "sticker";
    return "other";
  }

  // Uazap v2: mediaUrl field directly on message
  if (message.mediaUrl) {
    return { type: detectType(mimeType, msgType), url: message.mediaUrl, mimetype: mimeType };
  }

  // Uazap v2: hasMedia flag with media object or base64
  if (message.hasMedia) {
    const url = message.media?.url || message.media?.link || "";
    const base64 = message.media?.base64 || message.base64 || "";
    if (url || base64) {
      return { type: detectType(mimeType, msgType), url, base64, mimetype: mimeType || message.media?.mimetype || "" };
    }
  }

  // Check message type directly (audio, ptt, image, video, document, sticker)
  if (["audio", "ptt", "image", "video", "document", "sticker"].includes(msgType)) {
    const url = message.media?.url || message.media?.link || "";
    const base64 = message.media?.base64 || message.base64 || "";
    return { type: detectType(mimeType, msgType), url, base64, mimetype: mimeType };
  }

  // Check for media in content object (baileys format)
  const rawContent = message.content;
  if (rawContent && typeof rawContent === "object") {
    const mediaKey = Object.keys(rawContent).find(k => k.endsWith("Message"));
    if (mediaKey) {
      const mediaObj = rawContent[mediaKey];
      const url = mediaObj?.url || mediaObj?.directPath || "";
      if (mediaKey === "audioMessage") return { type: "audio", url };
      if (mediaKey === "imageMessage") return { type: "image", url };
      if (mediaKey === "videoMessage") return { type: "video", url };
      if (mediaKey === "documentMessage") return { type: "document", url };
      if (mediaKey === "stickerMessage") return { type: "sticker", url };
      return { type: "other", url };
    }
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
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

      // Debug: log full message keys and relevant fields for media detection
      console.log("Message keys:", Object.keys(message || {}));
      console.log("Message type:", message?.type, "hasMedia:", message?.hasMedia, "mediaUrl:", message?.mediaUrl?.slice?.(0, 80));
      if (message?.media) console.log("Message.media:", JSON.stringify(message.media).slice(0, 200));

      // Check for media first
      const media = extractMedia(message);
      let content = "";
      let mediaUrl: string | null = null;

      if (media && media.url) {
        mediaUrl = media.url;
        console.log(`Media detected: type=${media.type}, url=${media.url.slice(0, 80)}`);

        if (media.type === "audio" && LOVABLE_API_KEY) {
          content = await transcribeAudio(media.url, LOVABLE_API_KEY);
        } else if (media.type === "image" && LOVABLE_API_KEY) {
          content = await describeImage(media.url, LOVABLE_API_KEY);
        } else if (media.type === "video") {
          content = "[📹 Vídeo recebido - mídia não suportada]";
        } else if (media.type === "document") {
          content = "[📄 Documento recebido - mídia não suportada]";
        } else if (media.type === "sticker") {
          content = "[🎨 Figurinha recebida]";
        } else {
          content = "[📎 Mídia recebida - tipo não suportado]";
        }

        // If there's also a caption with the media, append it
        const caption = message?.caption || message?.content?.caption || "";
        if (caption) {
          content += `\nLegenda: ${caption}`;
        }
      }

      // If no media content, extract text normally
      if (!content) {
        const rawContent = message?.content;
        if (typeof rawContent === "string") {
          content = rawContent;
        } else if (rawContent && typeof rawContent === "object") {
          content = rawContent.text || rawContent.conversation || "";
        }
        if (!content) {
          content = message?.body || message?.text ||
                    message?.message?.conversation ||
                    message?.message?.extendedTextMessage?.text ||
                    chat?.wa_lastMessageTextVote || "";
        }
      }

      if (!content) {
        console.log("Skipping: no content");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Extract phone from chatId
      const phone = chatId.replace("@s.whatsapp.net", "").replace("@g.us", "");
      const contactName = chat?.name || chat?.wa_name || message?.pushName || phone;

      console.log("Processing:", { phone, contactName, isFromMe, content: content.slice(0, 80), hasMedia: !!media });

      // Find or create conversation
      let { data: conversation } = await supabase
        .from("conversations")
        .select("id, unread_count")
        .eq("user_id", userId)
        .eq("contact_phone", phone)
        .single();

      const displayMessage = content.length > 100 ? content.slice(0, 100) + "..." : content;

      if (!conversation) {
        const { data: newConv } = await supabase
          .from("conversations")
          .insert({
            user_id: userId,
            contact_name: contactName,
            contact_phone: phone,
            last_message: displayMessage,
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
            last_message: displayMessage,
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
          media_url: mediaUrl,
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
