import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { reportEdgeError } from "../_shared/error-reporter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function cleanBase64(value: string | undefined | null): string {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.+)$/s);
  if (dataUrlMatch) return dataUrlMatch[2].replace(/\s/g, "");
  const normalized = trimmed.replace(/\s/g, "");
  if (normalized.length < 120) return "";
  return /^[A-Za-z0-9+/=]+$/.test(normalized) ? normalized : "";
}

// Evolution v2 messageType values: conversation, imageMessage, videoMessage,
// audioMessage, documentMessage, stickerMessage, extendedTextMessage, etc.
function detectMediaType(messageType: string, mimetype: string): string {
  const all = `${messageType} ${mimetype}`.toLowerCase();
  if (all.includes("audio") || all.includes("ptt")) return "audio";
  if (all.includes("image")) return "image";
  if (all.includes("video")) return "video";
  if (all.includes("sticker")) return "sticker";
  if (all.includes("document") || all.includes("application")) return "document";
  return "other";
}

async function transcribeAudio(
  base64Audio: string,
  apiKey: string,
  mimetype: string,
): Promise<string> {
  try {
    if (!base64Audio || base64Audio.length < 100) {
      return "[🎵 Áudio recebido - sem dados para transcrever]";
    }
    const contentType = mimetype || "audio/ogg";
    const binaryStr = atob(base64Audio);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const ext = contentType.includes("ogg")
      ? "ogg"
      : contentType.includes("mp4") || contentType.includes("m4a")
        ? "m4a"
        : "mp3";
    const blob = new Blob([bytes], { type: contentType });
    const formData = new FormData();
    formData.append("file", blob, `audio.${ext}`);
    formData.append("model", "whisper-1");
    formData.append("language", "pt");

    const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });
    if (!resp.ok) {
      console.error("Whisper error:", resp.status, await resp.text());
      return "[🎵 Áudio recebido - não foi possível transcrever]";
    }
    const data = await resp.json();
    const text = data.text?.trim();
    return text ? `🎵 [Áudio]: ${text}` : "[🎵 Áudio recebido - não foi possível transcrever]";
  } catch (e) {
    console.error("transcribeAudio failed:", e);
    return "[🎵 Áudio recebido - não foi possível transcrever]";
  }
}

async function describeImage(
  base64Image: string,
  apiKey: string,
  mimetype: string,
  model: string = "gpt-4o-mini",
): Promise<string> {
  try {
    if (!base64Image || base64Image.length < 100) {
      return "[📷 Imagem recebida - sem dados para analisar]";
    }
    const contentType = mimetype || "image/jpeg";
    const effectiveModel = model.includes("gpt-4") || model.includes("gpt-5") ? model : "gpt-4o";

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
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
              {
                type: "text",
                text: "Descreva esta imagem de forma objetiva e concisa em português. Se houver texto, transcreva. Retorne APENAS a descrição.",
              },
              {
                type: "image_url",
                image_url: { url: `data:${contentType};base64,${base64Image}` },
              },
            ],
          },
        ],
      }),
    });
    if (!resp.ok) {
      console.error("Image AI error:", resp.status, await resp.text());
      return "[📷 Imagem recebida - não foi possível analisar]";
    }
    const data = await resp.json();
    const desc = data.choices?.[0]?.message?.content?.trim();
    return desc ? `📷 [Imagem]: ${desc}` : "[📷 Imagem recebida - não foi possível analisar]";
  } catch (e) {
    console.error("describeImage failed:", e);
    return "[📷 Imagem recebida - não foi possível analisar]";
  }
}

async function fetchEvolutionMediaBase64(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  messageKey: any,
): Promise<{ base64: string; mimetype: string } | null> {
  try {
    const resp = await fetch(
      `${baseUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ message: { key: messageKey }, convertToMp4: false }),
      },
    );
    if (!resp.ok) {
      console.error("Evolution media fetch failed:", resp.status, await resp.text());
      return null;
    }
    const data = await resp.json();
    const base64 = cleanBase64(data?.base64 || data?.data || "");
    const mimetype = (data?.mimetype || data?.mediaType || "") as string;
    if (!base64) return null;
    return { base64, mimetype };
  } catch (e) {
    console.error("fetchEvolutionMediaBase64 error:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const EVOLUTION_BASE_URL = (Deno.env.get("EVOLUTION_BASE_URL") || "").replace(/\/+$/, "");
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const payload = await req.json();
    const event = (payload?.event || "").toLowerCase();
    const instanceName = payload?.instance || payload?.instanceName;
    console.log("Evolution webhook:", event, "instance:", instanceName);

    if (!instanceName) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: integrations } = await supabase
      .from("integrations")
      .select("id, user_id, workspace_id, config, status")
      .eq("type", "whatsapp_evolution");

    const integration = integrations?.find((i) => {
      const cfg = i.config as { instanceName?: string };
      return cfg?.instanceName === instanceName;
    });

    if (!integration) {
      console.log("No matching evolution integration for instance:", instanceName);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = integration.user_id;
    const workspaceId = integration.workspace_id;
    const cfg = integration.config as {
      instanceName?: string;
      label?: string;
      ghl_user_id?: string;
    };
    const integrationLabel = cfg.label || "Evolution";
    const ghlUserId = cfg.ghl_user_id || null;

    // Connection state events
    if (event === "connection.update" || event === "connection_update") {
      const state = payload?.data?.state || payload?.data?.connection;
      const newStatus =
        state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
      const previousStatus = integration.status;

      await supabase
        .from("integrations")
        .update({ status: newStatus })
        .eq("id", integration.id);

      const justDisconnected =
        newStatus === "disconnected" &&
        (previousStatus === "connected" || previousStatus === "connecting");

      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
      if (justDisconnected && RESEND_API_KEY) {
        try {
          const { data: userData } = await supabase.auth.admin.getUserById(userId);
          const email = userData?.user?.email;
          if (email) {
            const fromAddress =
              Deno.env.get("RESEND_FROM_EMAIL") ||
              "VFlow360 <notificacao@vflow360.com.br>";
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: fromAddress,
                to: [email],
                subject: `WhatsApp desconectado — ${integrationLabel}`,
                html: `<p>Olá,</p>
<p>A instância <strong>${integrationLabel}</strong> (${instanceName}) foi desconectada do WhatsApp.</p>
<p>Para reconectar, acesse <a href="https://gestor.vflow360.com.br/integrations">VFlow360 → Integrações</a> e gere um novo QR Code.</p>
<p>— VFlow360</p>`,
              }),
            });
          }
        } catch (e) {
          console.error("Resend notify failed:", e);
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // QR code updated (just acknowledge — frontend pulls via status action)
    if (event === "qrcode.updated" || event === "qrcode_updated") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Incoming messages
    if (event === "messages.upsert" || event === "messages_upsert" || event === "message") {
      const data = payload?.data || {};
      const messageObj = data?.message || data;
      const key = data?.key || messageObj?.key;
      const chatId: string = key?.remoteJid || "";

      if (!chatId || chatId.endsWith("@g.us")) {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const isFromMe = !!key?.fromMe;
      const messageType: string = data?.messageType || "";
      const pushName: string = data?.pushName || "";

      // Extract text content from various Evolution v2 message shapes
      const msg = messageObj?.message || data?.message || {};
      const textContent: string =
        (typeof msg === "string" ? msg : "") ||
        msg?.conversation ||
        msg?.extendedTextMessage?.text ||
        msg?.imageMessage?.caption ||
        msg?.videoMessage?.caption ||
        msg?.documentMessage?.caption ||
        "";

      const mimetype: string =
        msg?.imageMessage?.mimetype ||
        msg?.videoMessage?.mimetype ||
        msg?.audioMessage?.mimetype ||
        msg?.documentMessage?.mimetype ||
        msg?.stickerMessage?.mimetype ||
        "";

      const mediaType = detectMediaType(messageType, mimetype);
      const hasMedia = mediaType !== "other";

      let content = "";
      let mediaUrl: string | null = null;

      if (hasMedia) {
        // Try to get base64: Evolution may send it inline (base64=true), or fetch on demand
        let mediaBase64 =
          cleanBase64(msg?.imageMessage?.base64) ||
          cleanBase64(msg?.audioMessage?.base64) ||
          cleanBase64(msg?.videoMessage?.base64) ||
          cleanBase64(msg?.documentMessage?.base64) ||
          cleanBase64(msg?.stickerMessage?.base64) ||
          cleanBase64(data?.base64) ||
          cleanBase64(messageObj?.base64) ||
          "";

        if (!mediaBase64 && key && EVOLUTION_BASE_URL && EVOLUTION_API_KEY && instanceName) {
          const fetched = await fetchEvolutionMediaBase64(
            EVOLUTION_BASE_URL,
            EVOLUTION_API_KEY,
            instanceName,
            key,
          );
          if (fetched) mediaBase64 = fetched.base64;
        }

        // Also expose direct URL if Evolution provided one
        mediaUrl =
          msg?.imageMessage?.url ||
          msg?.videoMessage?.url ||
          msg?.audioMessage?.url ||
          msg?.documentMessage?.url ||
          null;

        // Resolve AI provider
        let aiKey = OPENAI_API_KEY;
        let aiModel = "gpt-4o-mini";
        try {
          const { data: providerCfg } = await supabase
            .from("ai_provider_config")
            .select("provider, api_key, model")
            .eq("user_id", userId)
            .maybeSingle();
          if (providerCfg?.provider === "openai" && providerCfg?.api_key) {
            aiKey = providerCfg.api_key;
            aiModel = providerCfg.model || "gpt-4o";
          }
        } catch { /* fallback */ }

        const hasUsableData = mediaBase64.length > 100;

        if (mediaType === "audio" && aiKey && hasUsableData) {
          content = await transcribeAudio(mediaBase64, aiKey, mimetype);
        } else if (mediaType === "image" && aiKey && hasUsableData) {
          content = await describeImage(mediaBase64, aiKey, mimetype, aiModel);
        } else if (mediaType === "audio") {
          content = "[🎵 Áudio recebido]";
        } else if (mediaType === "image") {
          content = "[📷 Imagem recebida]";
        } else if (mediaType === "document") {
          const fileName: string = msg?.documentMessage?.fileName || "documento";
          const isPdf =
            (mimetype || "").toLowerCase().includes("pdf") ||
            fileName.toLowerCase().endsWith(".pdf");
          if (isPdf && hasUsableData) {
            try {
              const pdfResp = await fetch(`${SUPABASE_URL}/functions/v1/pdf-extract`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({
                  pdf_base64: mediaBase64,
                  file_name: fileName,
                  user_id: userId,
                }),
              });
              if (!pdfResp.ok) {
                console.error("Evolution PDF extract HTTP", pdfResp.status, await pdfResp.text());
                content = `📄 [PDF]: ${fileName} — Erro ao processar.`;
              } else {
                const pdfJson = await pdfResp.json();
                content = pdfJson?.error
                  ? `📄 [PDF]: ${fileName} — Erro ao processar.`
                  : (pdfJson?.message || `📄 [PDF]: ${fileName}`);
              }
            } catch (e) {
              console.error("Evolution PDF extract failed:", e);
              content = `📄 [PDF]: ${fileName} — Erro ao processar.`;
            }
          } else if (isPdf) {
            content = `📄 [PDF]: ${fileName} — Não foi possível baixar o arquivo.`;
          } else {
            content = `📎 [${fileName}] — tipo de arquivo não suportado. Apenas PDF (até 5 MB).`;
          }
        } else if (mediaType === "sticker") {
          content = "[🎨 Figurinha recebida]";
        } else {
          content = "[Tipo de mídia não suportado]";
        }

        if (textContent) content += `\nLegenda: ${textContent}`;
      } else {
        content = textContent;
      }

      if (!content) {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const phone = chatId.replace("@s.whatsapp.net", "").replace("@g.us", "");
      const contactName = pushName || phone;
      const displayMessage = content.length > 100 ? content.slice(0, 100) + "..." : content;

      let { data: conversation } = await supabase
        .from("conversations")
        .select("id, unread_count")
        .eq("user_id", userId)
        .eq("workspace_id", workspaceId)
        .eq("contact_phone", phone)
        .maybeSingle();

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
            integration_type: "evolution",
            integration_label: integrationLabel,
            ghl_user_id: ghlUserId,
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
            integration_type: "evolution",
            integration_label: integrationLabel,
            ghl_user_id: ghlUserId,
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

        // Update last_webhook_at marker
        try {
          await supabase
            .from("integrations")
            .update({ config: { ...cfg, last_webhook_at: new Date().toISOString() } })
            .eq("id", integration.id);
        } catch { /* ignore */ }
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Unhandled Evolution event:", event);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("evolution-webhook error:", error);
    await reportEdgeError("edge:evolution-webhook", error);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Silence unused warnings if any helper not yet used in dev.
void arrayBufferToBase64;
