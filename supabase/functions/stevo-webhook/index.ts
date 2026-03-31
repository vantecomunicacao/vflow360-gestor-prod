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

function normalizeMimeType(value: string, mediaType: string): string {
  const normalized = toText(value).split(";")[0].toLowerCase();
  if (normalized && normalized !== "application/octet-stream") return normalized;
  if (mediaType === "image") return "image/jpeg";
  if (mediaType === "audio") return "audio/ogg";
  if (mediaType === "video") return "video/mp4";
  return "application/octet-stream";
}

function normalizeMediaUrl(rawUrl: string): string {
  const value = toText(rawUrl);
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `https://mmg.whatsapp.net${value}`;
  return "";
}

function extractMediaData(input: unknown, depth = 0, seen = new WeakSet<object>()): ExtractedMedia {
  if (depth > 6 || input == null) return {};

  if (typeof input === "string") {
    const maybeDataUrl = extractDataUrl(input);
    if (maybeDataUrl.base64) return maybeDataUrl;
    if (/^https?:\/\//i.test(input.trim()) || input.trim().startsWith("/")) {
      return { url: normalizeMediaUrl(input.trim()) };
    }
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
    toText(obj.URL) ||
    toText(obj.link) ||
    toText(obj.downloadUrl) ||
    toText(obj.fileUrl) ||
    toText(obj.fileURL) ||
    toText(obj.directPath) ||
    toText(obj.DirectPath);

  const directMime =
    toText(obj.mimetype) ||
    toText(obj.mimeType) ||
    toText(obj.contentType) ||
    toText(obj.fileType) ||
    toText(obj.mediaType);

  const directBase64 =
    cleanBase64(toText(obj.base64)) ||
    cleanBase64(toText(obj.data)) ||
    cleanBase64(toText(obj.fileData)) ||
    cleanBase64(toText(obj.body)) ||
    cleanBase64(toText(obj.mediaBase64));

  let acc: ExtractedMedia = {
    url: normalizeMediaUrl(directUrl),
    base64: directBase64,
    mimetype: directMime,
  };

  for (const value of Object.values(obj)) {
    acc = mergeMedia(acc, extractMediaData(value, depth + 1, seen));
    if (acc.url && acc.base64 && acc.mimetype) break;
  }

  return acc;
}

async function fetchMediaFromUrl(
  fileUrl: string,
  fallbackMime: string,
  mediaType: string,
): Promise<{ base64: string; mimetype: string } | null> {
  try {
    const normalizedUrl = normalizeMediaUrl(fileUrl);
    if (!normalizedUrl) return null;

    console.log(`Stevo: trying direct ${mediaType} URL:`, normalizedUrl.slice(0, 120));
    const resp = await fetch(normalizedUrl);
    if (!resp.ok) {
      console.error(`Stevo direct ${mediaType} URL error:`, resp.status, await resp.text());
      return null;
    }

    const buffer = await resp.arrayBuffer();
    if (buffer.byteLength <= 100) {
      console.log(`Stevo: empty ${mediaType} response from URL`);
      return null;
    }

    const base64 = arrayBufferToBase64(buffer);
    const mimetype = normalizeMimeType(resp.headers.get("content-type") || fallbackMime, mediaType);
    return { base64, mimetype };
  } catch (e) {
    console.error(`Stevo direct ${mediaType} URL fetch failed:`, e);
    return null;
  }
}

// Download media via Stevo API
async function downloadMediaViaStevo(
  serverUrl: string,
  instanceToken: string,
  messageObj: Record<string, unknown>,
  mediaType: string,
  fallbackMime = "",
): Promise<{ base64: string; mimetype: string } | null> {
  try {
    if (!serverUrl || !instanceToken || !messageObj) {
      console.log("Stevo download: missing params");
      return null;
    }

    const candidatePaths = mediaType === "audio"
      ? ["/message/downloadaudio", "/message/downloadAudio", "/message/downloadvoice", "/message/downloadVoice", "/message/downloadimage"]
      : ["/message/downloadimage", "/message/downloadImage", "/message/downloadmedia", "/message/downloadMedia"];

    for (const path of candidatePaths) {
      const apiUrl = `${serverUrl}${path}`;
      console.log("Downloading media via Stevo API:", apiUrl);

      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: instanceToken,
        },
        body: JSON.stringify({ message: messageObj }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error("Stevo download error:", resp.status, errText.slice(0, 300));
        continue;
      }

      const contentType = resp.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const data = await resp.json();
        const base64 =
          cleanBase64(toText(data.base64)) ||
          cleanBase64(toText(data.data)) ||
          cleanBase64(toText(data.file)) ||
          cleanBase64(toText(data.fileData));
        const mime = normalizeMimeType(
          toText(data.mimetype) || toText(data.mimeType) || toText(data.contentType) || fallbackMime,
          mediaType,
        );

        if (base64.length > 100) {
          console.log("Stevo download success (json):", { mime, len: base64.length, path });
          return { base64, mimetype: mime };
        }

        const extracted = extractMediaData(data);
        if (extracted.base64 && extracted.base64.length > 100) {
          const extractedMime = normalizeMimeType(extracted.mimetype || mime, mediaType);
          console.log("Stevo download success (nested json):", { mime: extractedMime, len: extracted.base64.length, path });
          return { base64: extracted.base64, mimetype: extractedMime };
        }

        if (extracted.url) {
          const fromUrl = await fetchMediaFromUrl(extracted.url, extracted.mimetype || mime, mediaType);
          if (fromUrl) {
            console.log("Stevo download success (url in json):", { mime: fromUrl.mimetype, len: fromUrl.base64.length, path });
            return fromUrl;
          }
        }

        console.log("Stevo download: no usable data in JSON response, keys:", Object.keys(data));
        continue;
      }

      const buffer = await resp.arrayBuffer();
      if (buffer.byteLength > 100) {
        const b64 = arrayBufferToBase64(buffer);
        const mime = normalizeMimeType(contentType || fallbackMime, mediaType);
        console.log("Stevo download success (binary):", { mime, len: b64.length, path });
        return { base64: b64, mimetype: mime };
      }
    }

    console.log("Stevo download: media not retrieved from API");
    return null;
  } catch (e) {
    console.error("Stevo download failed:", e);
    return null;
  }
}

// Transcribe audio using AI
async function transcribeAudio(
  base64Audio: string,
  apiKey: string,
  mimetype: string,
  endpoint: string,
  model: string,
): Promise<string> {
  try {
    if (!base64Audio || base64Audio.length < 100) {
      return "[🎵 Áudio recebido]";
    }

    const contentType = mimetype || "audio/ogg";
    const isOpenAI = endpoint.includes("api.openai.com");

    const messages: unknown[] = isOpenAI
      ? [{ role: "user", content: "Este áudio foi recebido pelo WhatsApp. Infelizmente não é possível processar áudio diretamente. Retorne '[🎵 Áudio recebido]'." }]
      : [{
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
        }];

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages }),
    });

    if (!response.ok) {
      console.error("AI transcription error:", response.status, await response.text());
      return "[🎵 Áudio recebido]";
    }

    const data = await response.json();
    const transcription = data.choices?.[0]?.message?.content?.trim();
    return transcription && transcription !== "[Áudio inaudível]"
      ? `🎵 [Áudio]: ${transcription}`
      : "[🎵 Áudio recebido]";
  } catch (e) {
    console.error("Audio transcription failed:", e);
    return "[🎵 Áudio recebido]";
  }
}

// Describe image using AI
async function describeImage(
  base64Image: string,
  apiKey: string,
  mimetype: string,
  endpoint: string,
  model: string,
): Promise<string> {
  try {
    if (!base64Image || base64Image.length < 100) {
      return "[📷 Imagem recebida]";
    }

    const contentType = mimetype || "image/jpeg";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Descreva esta imagem de forma objetiva e concisa em português. Se houver texto na imagem, transcreva-o. Se for um documento, descreva o conteúdo. Se for um print de tela, descreva o que aparece. Retorne APENAS a descrição." },
            { type: "image_url", image_url: { url: `data:${contentType};base64,${base64Image}` } },
          ],
        }],
      }),
    });

    if (!response.ok) {
      console.error("AI image description error:", response.status, await response.text());
      return "[📷 Imagem recebida]";
    }

    const data = await response.json();
    const description = data.choices?.[0]?.message?.content?.trim();
    return description ? `📷 [Imagem]: ${description}` : "[📷 Imagem recebida]";
  } catch (e) {
    console.error("Image description failed:", e);
    return "[📷 Imagem recebida]";
  }
}

// Detect media type from Stevo Message object
function detectStevoMedia(messageData: Record<string, unknown>): { type: string; mimetype: string } | null {
  if (!messageData) return null;
  if (messageData.imageMessage) {
    const img = messageData.imageMessage as Record<string, unknown>;
    return { type: "image", mimetype: (img.mimetype as string) || "image/jpeg" };
  }
  if (messageData.audioMessage || messageData.pttMessage) {
    const audio = (messageData.audioMessage || messageData.pttMessage) as Record<string, unknown>;
    return { type: "audio", mimetype: (audio.mimetype as string) || "audio/ogg" };
  }
  if (messageData.videoMessage) return { type: "video", mimetype: "video/mp4" };
  if (messageData.documentMessage) return { type: "document", mimetype: "application/octet-stream" };
  if (messageData.stickerMessage) return { type: "sticker", mimetype: "image/webp" };
  if (messageData.contactMessage || messageData.contactsArrayMessage) return { type: "contact", mimetype: "" };
  if (messageData.locationMessage || messageData.liveLocationMessage) return { type: "location", mimetype: "" };
  return null;
}

// Parse safe timestamp
function parseSafeTimestamp(rawTs: unknown): string {
  try {
    if (!rawTs) return new Date().toISOString();
    const asNum = Number(rawTs);
    if (!isNaN(asNum) && asNum > 1000000000 && asNum < 9999999999) {
      return new Date(asNum * 1000).toISOString();
    }
    if (!isNaN(asNum) && asNum > 1000000000000) {
      return new Date(asNum).toISOString();
    }
    const d = new Date(String(rawTs));
    return isNaN(d.getTime()) || d.getFullYear() < 2000 ? new Date().toISOString() : d.toISOString();
  } catch {
    return new Date().toISOString();
  }
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

    const url = new URL(req.url);
    const integrationId = url.searchParams.get("id");

    if (!integrationId) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    let payload = await req.json();

    // Handle array wrapper
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

    // Save serverUrl and instanceToken from payload into config for future API calls
    const config = (integration.config as Record<string, unknown>) || {};
    const serverUrl = (payload.serverUrl as string) || (config.serverUrl as string) || "";
    const instanceToken = (payload.instanceToken as string) || (config.instanceToken as string) || "";

    await supabase
      .from("integrations")
      .update({
        config: {
          ...config,
          last_webhook_at: new Date().toISOString(),
          serverUrl: serverUrl || config.serverUrl,
          instanceToken: instanceToken || config.instanceToken,
        },
        status: "connected",
      })
      .eq("id", integration.id);

    console.log("Stevo webhook event:", payload.event, "instance:", payload.instanceName);

    const event = payload.event;

    if (event !== "Message") {
      console.log("Stevo: unhandled event:", event);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sourceMsg = payload.SourceWebMsg || payload.sourceWebMsg || null;
    const messageData = (payload.Message || payload.message || {}) as Record<string, unknown>;
    const infoData = payload.Info || payload.info || null;

    // Determine remoteJID and isFromMe
    let remoteJID = "";
    let isFromMe = false;

    if (sourceMsg?.key) {
      const msgKey = sourceMsg.key;
      remoteJID = msgKey.remoteJID || msgKey.remoteJid || msgKey.RemoteJID || "";
      isFromMe = msgKey.fromMe === true || msgKey.FromMe === true;
    } else if (infoData) {
      remoteJID = infoData.Chat || infoData.chat || "";
      isFromMe = infoData.IsFromMe === true || infoData.isFromMe === true;
    } else {
      const msgKey = payload?.key || payload?.Key;
      if (msgKey) {
        remoteJID = msgKey.remoteJID || msgKey.remoteJid || msgKey.RemoteJID || "";
        isFromMe = msgKey.fromMe === true || msgKey.FromMe === true;
      }
    }

    if (!remoteJID) {
      console.log("Stevo: no remoteJID found");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (remoteJID.endsWith("@g.us")) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phone = remoteJID.replace("@s.whatsapp.net", "").replace("@lid", "").replace("@g.us", "");

    // Extract contact name ONLY from inbound messages (pushName = lead's name)
    // For outbound, pushName would be the owner's name, so we skip it
    let inboundContactName = "";
    if (!isFromMe) {
      inboundContactName =
        sourceMsg?.pushName || sourceMsg?.PushName ||
        infoData?.PushName || infoData?.pushName ||
        payload.senderName || payload.pushName || "";
    }

    // Detect media
    const media = detectStevoMedia(messageData);
    let content = "";

    if (media) {
      console.log("Stevo media detected:", media.type, media.mimetype);

      // Get AI config
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
      } catch { /* use defaults */ }

      if ((media.type === "audio" || media.type === "image") && aiKey) {
        let mediaBase64 = "";
        let mediaMime = normalizeMimeType(media.mimetype, media.type);

        const primaryMediaNode = media.type === "image"
          ? messageData.imageMessage
          : (messageData.audioMessage || messageData.pttMessage);

        const extractedMedia = mergeMedia(
          extractMediaData(primaryMediaNode),
          extractMediaData({
            payload,
            messageData,
            sourceMsg,
            infoData,
          }),
        );

        if (extractedMedia.base64 && extractedMedia.base64.length > 100) {
          mediaBase64 = extractedMedia.base64;
          mediaMime = normalizeMimeType(extractedMedia.mimetype || mediaMime, media.type);
          console.log(`Stevo: using base64 from payload for ${media.type}, len:`, mediaBase64.length);
        }

        if (!mediaBase64 && serverUrl && instanceToken) {
          const downloaded = await downloadMediaViaStevo(
            serverUrl,
            instanceToken,
            messageData,
            media.type,
            extractedMedia.mimetype || mediaMime,
          );
          if (downloaded && downloaded.base64.length > 100) {
            mediaBase64 = downloaded.base64;
            mediaMime = normalizeMimeType(downloaded.mimetype || mediaMime, media.type);
          }
        }

        if (!mediaBase64 && extractedMedia.url) {
          const fromUrl = await fetchMediaFromUrl(extractedMedia.url, extractedMedia.mimetype || mediaMime, media.type);
          if (fromUrl) {
            mediaBase64 = fromUrl.base64;
            mediaMime = normalizeMimeType(fromUrl.mimetype || mediaMime, media.type);
            console.log(`Stevo: got ${media.type} from extracted URL, len:`, mediaBase64.length);
          }
        }

        if (mediaBase64 && mediaBase64.length > 100) {
          if (media.type === "audio") {
            content = await transcribeAudio(mediaBase64, aiKey, mediaMime, aiEndpoint, aiModel);
          } else {
            content = await describeImage(mediaBase64, aiKey, mediaMime, aiEndpoint, aiModel);
          }
        } else {
          console.log(`Stevo: no usable ${media.type} media extracted`);
          content = media.type === "audio" ? "[🎵 Áudio recebido]" : "[📷 Imagem recebida]";
        }
      } else if (media.type === "audio") {
        content = "[🎵 Áudio recebido]";
      } else if (media.type === "image") {
        const img = messageData.imageMessage as Record<string, unknown> | undefined;
        content = img?.caption ? `📷 [Imagem]: ${img.caption}` : "[📷 Imagem recebida]";
      } else if (media.type === "video") {
        const vid = messageData.videoMessage as Record<string, unknown> | undefined;
        content = vid?.caption ? `🎬 [Vídeo]: ${vid.caption}` : "[Enviado uma mídia não suportada]";
      } else if (media.type === "document") {
        const doc = messageData.documentMessage as Record<string, unknown> | undefined;
        content = doc?.fileName ? `📎 [Documento]: ${doc.fileName}` : "[Enviado uma mídia não suportada]";
      } else if (media.type === "sticker") {
        content = "[🎨 Figurinha recebida]";
      } else if (media.type === "contact") {
        content = "[📇 Contato compartilhado]";
      } else if (media.type === "location") {
        content = "[📍 Localização compartilhada]";
      } else {
        content = "[Enviado uma mídia não suportada]";
      }
    }

    // Extract text content if no media
    if (!content) {
      content =
        (messageData?.conversation as string) ||
        (messageData?.extendedTextMessage as Record<string, unknown>)?.text as string ||
        sourceMsg?.message?.conversation ||
        sourceMsg?.message?.extendedTextMessage?.text ||
        "";
    }

    if (!content) {
      console.log("Stevo: no content extracted");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const msgTimestamp = parseSafeTimestamp(
      sourceMsg?.messageTimestamp || infoData?.Timestamp || payload?.messageTimestamp,
    );

    console.log("Stevo processing:", { phone, inboundContactName, isFromMe, content: content.slice(0, 80) });

    // Find or create conversation
    let { data: conversation } = await supabase
      .from("conversations")
      .select("id, unread_count, contact_name")
      .eq("user_id", userId)
      .eq("contact_phone", phone)
      .maybeSingle();

    const displayMessage = content.length > 100 ? content.slice(0, 100) + "..." : content;

    // Determine the contact name to use:
    // - For new conversations: use inbound name or phone
    // - For updates: only change name if we have a valid inbound name
    const effectiveContactName = inboundContactName || phone;

    if (!conversation) {
      const { data: newConv } = await supabase
        .from("conversations")
        .insert({
          user_id: userId,
          contact_name: effectiveContactName,
          contact_phone: phone,
          last_message: displayMessage,
          last_message_at: msgTimestamp,
          unread_count: isFromMe ? 0 : 1,
          integration_type: "stevo",
        })
        .select("id, unread_count, contact_name")
        .single();
      conversation = newConv;
    } else {
      // Only update contact_name if we have a valid inbound name
      const updateData: Record<string, unknown> = {
        last_message: displayMessage,
        last_message_at: msgTimestamp,
        unread_count: isFromMe ? conversation.unread_count : (conversation.unread_count || 0) + 1,
        integration_type: "stevo",
      };

      if (inboundContactName) {
        updateData.contact_name = inboundContactName;
      }

      await supabase.from("conversations").update(updateData).eq("id", conversation.id);
    }

    if (conversation) {
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        direction: isFromMe ? "outbound" : "inbound",
        content,
        created_at: msgTimestamp,
      });

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
