import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ExtractedMedia = {
  url?: string;
  base64?: string;
  mimetype?: string;
};

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanBase64(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.+)$/s);
  if (dataUrlMatch) {
    return dataUrlMatch[2].replace(/\s/g, "");
  }

  const normalized = trimmed.replace(/\s/g, "");
  if (normalized.length < 120) return "";
  return /^[A-Za-z0-9+/=]+$/.test(normalized) ? normalized : "";
}

function extractDataUrl(value: string): ExtractedMedia {
  const match = value.trim().match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return {};
  return {
    mimetype: match[1],
    base64: match[2].replace(/\s/g, ""),
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function mergeMedia(primary: ExtractedMedia, fallback: ExtractedMedia): ExtractedMedia {
  return {
    url: primary.url || fallback.url,
    base64: primary.base64 || fallback.base64,
    mimetype: primary.mimetype || fallback.mimetype,
  };
}

function extractMediaData(input: unknown, depth = 0, seen = new WeakSet<object>()): ExtractedMedia {
  if (depth > 6 || input == null) return {};

  if (typeof input === "string") {
    const maybeDataUrl = extractDataUrl(input);
    if (maybeDataUrl.base64) return maybeDataUrl;
    if (/^https?:\/\//i.test(input.trim())) return { url: input.trim() };
    const maybeBase64 = cleanBase64(input);
    return maybeBase64 ? { base64: maybeBase64 } : {};
  }

  if (Array.isArray(input)) {
    let acc: ExtractedMedia = {};
    for (const item of input) {
      acc = mergeMedia(acc, extractMediaData(item, depth + 1, seen));
      if (acc.url && acc.base64 && acc.mimetype) break;
    }
    return acc;
  }

  if (typeof input !== "object") return {};
  const obj = input as Record<string, unknown>;
  if (seen.has(obj)) return {};
  seen.add(obj);

  const directUrl =
    toText(obj.mediaUrl) ||
    toText(obj.url) ||
    toText(obj.link) ||
    toText(obj.downloadUrl) ||
    toText(obj.fileUrl) ||
    toText(obj.directPath);

  const directMime =
    toText(obj.mimetype) ||
    toText(obj.mimeType) ||
    toText(obj.contentType) ||
    toText(obj.fileType);

  const directBase64 =
    cleanBase64(toText(obj.base64)) ||
    cleanBase64(toText(obj.data)) ||
    cleanBase64(toText(obj.fileData)) ||
    cleanBase64(toText(obj.body));

  let acc: ExtractedMedia = {
    url: /^https?:\/\//i.test(directUrl) ? directUrl : "",
    base64: directBase64,
    mimetype: directMime,
  };

  for (const value of Object.values(obj)) {
    acc = mergeMedia(acc, extractMediaData(value, depth + 1, seen));
    if (acc.url && acc.base64 && acc.mimetype) break;
  }

  return acc;
}

// Download media via Uazap API
async function downloadMediaViaUazap(
  messageId: string,
  instanceName: string,
  instanceToken: string,
  mediaType: string,
): Promise<{ base64: string; mimetype: string } | null> {
  try {
    const subdomain = Deno.env.get("UAZAP_SUBDOMAIN") || "";
    if (!subdomain || !messageId || !instanceToken) {
      console.error("Missing params for Uazap download:", {
        subdomain: !!subdomain,
        messageId: !!messageId,
        instanceToken: !!instanceToken,
      });
      return null;
    }

    const apiUrl = `https://${subdomain}.uazapi.com/message/download`;
    console.log("Downloading media via Uazap API:", { messageId, instanceName, apiUrl });

    // Official endpoint from Uazap OpenAPI spec
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: instanceToken,
      },
      body: JSON.stringify({
        id: messageId,
        return_base64: true,
        return_link: true,
        generate_mp3: mediaType === "audio",
        transcribe: false,
        download_quoted: false,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Uazap download error (official endpoint):", resp.status, errText);

      // Legacy fallback for older environments
      const legacyUrl = `https://${subdomain}.uazapi.com/message/download/${instanceName}?token=${instanceToken}&messageId=${messageId}`;
      const legacyResp = await fetch(legacyUrl, { method: "GET" });
      if (!legacyResp.ok) {
        const legacyErrText = await legacyResp.text();
        console.error("Uazap download error (legacy endpoint):", legacyResp.status, legacyErrText);
        return null;
      }

      const legacyData = await legacyResp.json();
      const legacyBase64 = cleanBase64(
        toText(legacyData.base64Data) ||
          toText(legacyData.base64) ||
          toText(legacyData.data) ||
          toText(legacyData.file),
      );
      const legacyMime =
        toText(legacyData.mimetype) ||
        toText(legacyData.mimeType) ||
        toText(legacyData.contentType) ||
        "";

      if (legacyBase64.length > 100) {
        console.log("Uazap download success (legacy endpoint):", {
          mime: legacyMime,
          base64Len: legacyBase64.length,
        });
        return { base64: legacyBase64, mimetype: legacyMime };
      }

      return null;
    }

    const data = await resp.json();
    let base64 = cleanBase64(
      toText(data.base64Data) ||
        toText(data.base64) ||
        toText(data.data) ||
        toText(data.file),
    );
    let mimetype =
      toText(data.mimetype) ||
      toText(data.mimeType) ||
      toText(data.contentType) ||
      "";

    // Fallback: if API only returns link, fetch the binary and convert to base64
    const fileURL = toText(data.fileURL);
    if (base64.length < 100 && fileURL) {
      try {
        const fileResp = await fetch(fileURL);
        if (fileResp.ok) {
          const contentType = fileResp.headers.get("content-type") || "";
          const fileBuffer = await fileResp.arrayBuffer();
          base64 = arrayBufferToBase64(fileBuffer);
          if (!mimetype && contentType) mimetype = contentType;
        }
      } catch (fileErr) {
        console.error("Uazap fileURL fetch failed:", fileErr);
      }
    }

    if (base64.length > 100) {
      console.log("Uazap download success (official endpoint):", {
        mime: mimetype,
        base64Len: base64.length,
      });
      return { base64, mimetype };
    }

    console.log("Uazap download returned no usable data (official endpoint):", Object.keys(data));
    return null;
  } catch (e) {
    console.error("Uazap download failed:", e);
    return null;
  }
}

// Transcribe audio using AI (supports Lovable AI and OpenAI)
async function transcribeAudio(base64Audio: string, apiKey: string, mimetype: string, endpoint: string = "https://ai.gateway.lovable.dev/v1/chat/completions", model: string = "google/gemini-2.5-flash"): Promise<string> {
  try {
    if (!base64Audio || base64Audio.length < 100) {
      return "[🎵 Áudio recebido - sem dados para transcrever]";
    }

    const contentType = mimetype || "audio/ogg";
    const isOpenAI = endpoint.includes("api.openai.com");

    if (isOpenAI) {
      // Use OpenAI Whisper API for audio transcription
      try {
        const binaryStr = atob(base64Audio);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        const ext = contentType.includes("ogg") ? "ogg" : contentType.includes("mp4") || contentType.includes("m4a") ? "m4a" : "mp3";
        const blob = new Blob([bytes], { type: contentType });
        const formData = new FormData();
        formData.append("file", blob, `audio.${ext}`);
        formData.append("model", "whisper-1");
        formData.append("language", "pt");

        const whisperResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
        });

        if (!whisperResp.ok) {
          console.error("Whisper API error:", whisperResp.status, await whisperResp.text());
          return "[🎵 Áudio recebido - não foi possível transcrever]";
        }

        const whisperData = await whisperResp.json();
        const text = whisperData.text?.trim();
        console.log("Whisper transcription result:", text?.slice(0, 100));
        return text ? `🎵 [Áudio]: ${text}` : "[🎵 Áudio recebido - não foi possível transcrever]";
      } catch (e) {
        console.error("Whisper transcription failed:", e);
        return "[🎵 Áudio recebido - não foi possível transcrever]";
      }
    }

    // Lovable AI: use input_audio in chat completions
    const messages: any[] = [
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
    ];

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("AI transcription error:", response.status, errBody);
      return "[🎵 Áudio recebido - não foi possível transcrever]";
    }

    const data = await response.json();
    const transcription = data.choices?.[0]?.message?.content?.trim();
    console.log("Transcription result:", transcription?.slice(0, 100));
    return transcription && transcription !== "[Áudio inaudível]" 
      ? `🎵 [Áudio]: ${transcription}` 
      : "[🎵 Áudio recebido - não foi possível transcrever]";
  } catch (e) {
    console.error("Audio transcription failed:", e);
    return "[🎵 Áudio recebido - não foi possível transcrever]";
  }
}

// Describe image using AI (supports Lovable AI and OpenAI)
async function describeImage(base64Image: string, apiKey: string, mimetype: string, endpoint: string = "https://ai.gateway.lovable.dev/v1/chat/completions", model: string = "google/gemini-2.5-flash"): Promise<string> {
  try {
    if (!base64Image || base64Image.length < 100) {
      return "[📷 Imagem recebida - sem dados para analisar]";
    }

    const contentType = mimetype || "image/jpeg";
    const isOpenAI = endpoint.includes("api.openai.com");
    // Ensure vision-capable model for OpenAI
    const effectiveModel = isOpenAI ? (model.includes("gpt-4") || model.includes("gpt-5") ? model : "gpt-4o") : model;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: effectiveModel,
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
      const errBody = await response.text();
      console.error("AI image description error:", response.status, errBody);
      return "[📷 Imagem recebida - não foi possível analisar]";
    }

    const data = await response.json();
    const description = data.choices?.[0]?.message?.content?.trim();
    console.log("Image description result:", description?.slice(0, 100));
    return description ? `📷 [Imagem]: ${description}` : "[📷 Imagem recebida - não foi possível analisar]";
  } catch (e) {
    console.error("Image description failed:", e);
    return "[📷 Imagem recebida - não foi possível analisar]";
  }
}

// Detect media type and extract URL from Uazap payload
function extractMedia(message: any): { type: string; url: string; base64?: string; mimetype?: string } | null {
  if (!message) return null;

  const mimeType = message.mimetype || message.media?.mimetype || "";
  const mediaType = message.mediaType || ""; // Uazap v2: "image", "audio", "video", etc.
  const msgType = message.type || "";
  const messageType = message.messageType || "";

  // Determine media type from various fields
  function detectType(mime: string, type: string, mediaT: string, msgT: string): string {
    const all = `${mime} ${type} ${mediaT} ${msgT}`.toLowerCase();
    if (all.includes("audio") || type === "ptt" || mediaT === "ptt") return "audio";
    if (all.includes("image")) return "image";
    if (all.includes("video")) return "video";
    if (all.includes("document") || all.includes("application")) return "document";
    if (all.includes("sticker")) return "sticker";
    return "other";
  }

  const isKnownMediaMessageType = /audio|image|video|document|sticker/i.test(messageType || "");
  const isKnownMediaType = ["audio", "ptt", "image", "video", "document", "sticker", "media"].includes(msgType);
  const hasMediaHint = isKnownMediaType || !!mediaType || isKnownMediaMessageType || message.hasMedia === true;

  if (!hasMediaHint) return null;

  const detectedType = detectType(mimeType, msgType, mediaType, messageType);
  const extracted = mergeMedia(
    extractMediaData(message),
    mergeMedia(extractMediaData(message.media), extractMediaData(message.content)),
  );

  const finalUrl = extracted.url || "";
  const finalBase64 = extracted.base64 || "";
  const finalMime = mimeType || extracted.mimetype || (detectedType !== "other" ? `${detectedType}/*` : "");

  return {
    type: detectedType,
    url: finalUrl,
    base64: finalBase64 || undefined,
    mimetype: finalMime || undefined,
  };
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
      .select("id, user_id, config, workspace_id")
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
    const workspaceId = integration.workspace_id;
    const integrationConfig = integration.config as { token?: string; instanceName?: string; label?: string };
    const integrationLabel = integrationConfig.label || "Uazap";
    const instToken = integrationConfig.token || instanceToken || "";
    // Handle connection status changes
    if (event === "status" || event === "connection.update" || event === "status_instance") {
      const status = payload.data?.status || payload.status || payload.instance?.status;
      if (status) {
        await supabase
          .from("integrations")
          .update({ status: status === "connected" ? "connected" : "disconnected" })
          .eq("id", integration.id);
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

      // Debug: log fields for media detection
      console.log("Message keys:", Object.keys(message || {}));
      console.log("Media fields:", {
        type: message?.type,
        mediaType: message?.mediaType,
        messageType: message?.messageType,
        hasMedia: message?.hasMedia,
        mediaUrl: message?.mediaUrl?.slice?.(0, 80),
        contentType: typeof message?.content,
        contentLen: typeof message?.content === "string" ? message.content.length : 0,
        contentKeys: message?.content && typeof message.content === "object" ? Object.keys(message.content).slice(0, 10) : [],
      });

      // Check for media first
      const media = extractMedia(message);
      let content = "";
      let mediaUrl: string | null = null;

      if (media) {
        mediaUrl = media.url || null;
        console.log(`Media detected: type=${media.type}, hasUrl=${!!media.url}, hasBase64=${!!(media.base64 && media.base64.length > 0)}, mime=${media.mimetype}`);

        // Try to get media base64 via Uazap download API first
        let mediaBase64 = media.base64 || "";
        let mediaMime = media.mimetype || "";
        const messageId = message?.messageid || message?.id || message?.key?.id || "";

        if ((!mediaBase64 || mediaBase64.length < 100) && messageId && instanceName) {
          console.log("Attempting Uazap API download for message:", messageId);
          const downloaded = await downloadMediaViaUazap(messageId, instanceName, instToken, media.type);
          if (downloaded) {
            mediaBase64 = downloaded.base64;
            mediaMime = downloaded.mimetype || mediaMime;
          }
        }

        const hasUsableData = mediaBase64.length > 100;

        // Fetch AI provider config for this user
        let aiEndpoint = "https://ai.gateway.lovable.dev/v1/chat/completions";
        let aiKey = LOVABLE_API_KEY;
        let aiModel = "google/gemini-2.5-flash";
        
        try {
          const { data: providerCfg } = await supabase
            .from("ai_provider_config")
            .select("provider, api_key, model")
            .eq("user_id", userId)
            .maybeSingle();
          if (providerCfg?.provider === "openai" && providerCfg?.api_key) {
            aiEndpoint = "https://api.openai.com/v1/chat/completions";
            aiKey = providerCfg.api_key;
            aiModel = providerCfg.model || "gpt-4o";
          }
        } catch (e) {
          console.log("Could not fetch AI provider config, using default");
        }

        if (media.type === "audio" && aiKey && hasUsableData) {
          content = await transcribeAudio(mediaBase64, aiKey, mediaMime, aiEndpoint, aiModel);
        } else if (media.type === "image" && aiKey && hasUsableData) {
          content = await describeImage(mediaBase64, aiKey, mediaMime, aiEndpoint, aiModel);
        } else if (media.type === "audio") {
          content = "[🎵 Áudio recebido]";
        } else if (media.type === "image") {
          content = "[📷 Imagem recebida]";
        } else if (media.type === "video") {
          content = "[Enviado uma mídia não suportada]";
        } else if (media.type === "document") {
          content = "[Enviado uma mídia não suportada]";
        } else if (media.type === "sticker") {
          content = "[🎨 Figurinha recebida]";
        } else {
          content = "[Enviado uma mídia não suportada]";
        }

        // If there's also a caption/text with the media, append it
        const caption = message?.caption || message?.text || message?.content?.caption || "";
        if (caption && typeof caption === "string") {
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
            workspace_id: workspaceId,
            contact_name: contactName,
            contact_phone: phone,
            last_message: displayMessage,
            last_message_at: new Date().toISOString(),
            unread_count: isFromMe ? 0 : 1,
            integration_type: "uazap",
            integration_label: integrationLabel,
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
            integration_type: "uazap",
            integration_label: integrationLabel,
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
