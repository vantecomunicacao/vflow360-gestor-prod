import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { reportEdgeError } from "../_shared/error-reporter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-stevo-instance, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

async function transcribeAudio(
  base64Audio: string,
  apiKey: string,
  mimetype: string,
  endpoint: string,
  model: string,
): Promise<string> {
  try {
    if (!base64Audio || base64Audio.length < 100) return "[🎵 Áudio recebido]";
    const contentType = mimetype || "audio/ogg";
    const isOpenAI = endpoint.includes("api.openai.com");

    if (isOpenAI) {
      const binaryStr = atob(base64Audio);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const ext = contentType.includes("ogg") ? "ogg" : contentType.includes("mp4") || contentType.includes("m4a") ? "m4a" : "mp3";
      const blob = new Blob([bytes], { type: contentType });
      const formData = new FormData();
      formData.append("file", blob, `audio.${ext}`);
      formData.append("model", "whisper-1");
      formData.append("language", "pt");
      const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });
      if (!r.ok) return "[🎵 Áudio recebido]";
      const j = await r.json();
      const t = j.text?.trim();
      return t ? `🎵 [Áudio]: ${t}` : "[🎵 Áudio recebido]";
    }

    const messages = [{
      role: "user",
      content: [
        { type: "text", text: "Transcreva este áudio em português. Retorne APENAS o texto transcrito." },
        {
          type: "input_audio",
          input_audio: {
            data: base64Audio,
            format: contentType.includes("ogg") ? "ogg" : contentType.includes("mp4") || contentType.includes("m4a") ? "m4a" : "mp3",
          },
        },
      ],
    }];
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages }),
    });
    if (!r.ok) return "[🎵 Áudio recebido]";
    const j = await r.json();
    const t = j.choices?.[0]?.message?.content?.trim();
    return t && t !== "[Áudio inaudível]" ? `🎵 [Áudio]: ${t}` : "[🎵 Áudio recebido]";
  } catch (e) {
    console.error("Audio transcription failed:", e);
    return "[🎵 Áudio recebido]";
  }
}

async function describeImage(
  base64Image: string,
  apiKey: string,
  mimetype: string,
  endpoint: string,
  model: string,
): Promise<string> {
  try {
    if (!base64Image || base64Image.length < 100) return "[📷 Imagem recebida]";
    const contentType = mimetype || "image/jpeg";
    const isOpenAI = endpoint.includes("api.openai.com");
    const effectiveModel = isOpenAI ? (model.includes("gpt-4") || model.includes("gpt-5") ? model : "gpt-4o") : model;
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: effectiveModel,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Descreva esta imagem de forma objetiva e concisa em português. Se houver texto, transcreva-o." },
            { type: "image_url", image_url: { url: `data:${contentType};base64,${base64Image}` } },
          ],
        }],
      }),
    });
    if (!r.ok) return "[📷 Imagem recebida]";
    const j = await r.json();
    const d = j.choices?.[0]?.message?.content?.trim();
    return d ? `📷 [Imagem]: ${d}` : "[📷 Imagem recebida]";
  } catch (e) {
    console.error("Image description failed:", e);
    return "[📷 Imagem recebida]";
  }
}

// Download media from Meta Cloud API using media id
async function downloadMetaMedia(
  mediaId: string,
  accessToken: string,
): Promise<{ base64: string; mimetype: string } | null> {
  try {
    if (!mediaId || !accessToken) return null;

    // Step 1: get media URL
    const metaResp = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!metaResp.ok) {
      console.error("Meta media metadata error:", metaResp.status, await metaResp.text());
      return null;
    }
    const meta = await metaResp.json();
    const url = meta.url;
    const mimetype = meta.mime_type || "application/octet-stream";
    if (!url) return null;

    // Step 2: download bytes
    const fileResp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!fileResp.ok) {
      console.error("Meta media download error:", fileResp.status);
      return null;
    }
    const buf = await fileResp.arrayBuffer();
    if (buf.byteLength < 100) return null;
    return { base64: arrayBufferToBase64(buf), mimetype };
  } catch (e) {
    console.error("downloadMetaMedia failed:", e);
    return null;
  }
}

async function processWebhook(rawPayload: unknown, integrationId: string, instanceHeader: string) {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: integration } = await supabase
      .from("integrations")
      .select("id, user_id, config, workspace_id")
      .eq("id", integrationId)
      .eq("type", "whatsapp_stevo_oficial")
      .single();

    if (!integration) {
      console.log("No matching Stevo Oficial integration for ID:", integrationId);
      return;
    }

    const userId = integration.user_id;
    const workspaceId = integration.workspace_id;
    const config = (integration.config as Record<string, unknown>) || {};
    const integrationLabel = (config.label as string) || "Stevo Oficial";
    const ghlUserId = (config.ghl_user_id as string) || null;
    const accessToken = (config.accessToken as string) || "";

    // Normalize payload: array wrapper from n8n
    let payload = rawPayload as any;
    if (Array.isArray(payload)) payload = payload[0] || {};
    // n8n style: { headers, body: {...} }
    const body = payload.body && typeof payload.body === "object" ? payload.body : payload;

    // Update last_webhook_at + instanceHeader
    supabase
      .from("integrations")
      .update({
        config: {
          ...config,
          last_webhook_at: new Date().toISOString(),
          instanceName: instanceHeader || (config.instanceName as string) || "",
        },
        status: "connected",
      })
      .eq("id", integration.id)
      .then(() => {});

    const entries = Array.isArray(body.entry) ? body.entry : [];
    if (entries.length === 0) {
      console.log("Stevo Oficial: no entries in payload");
      return;
    }

    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change.value || {};
        // Accept both inbound messages and outbound message_echoes (sent by the seller)
        const isEcho =
          change.field === "message_echoes" ||
          change.field === "smb_message_echoes" ||
          Array.isArray(value.message_echoes);
        if (change.field !== "messages" && !isEcho && !Array.isArray(value.messages)) continue;

        const metadata = value.metadata || {};
        const ourPhoneNumberId = String(metadata.phone_number_id || "");
        const ourDisplayNumber = String(metadata.display_phone_number || "").replace(/\D/g, "");

        const contacts = Array.isArray(value.contacts) ? value.contacts : [];
        const messages = Array.isArray(value.messages)
          ? value.messages
          : Array.isArray(value.message_echoes)
            ? value.message_echoes
            : [];
        const statuses = Array.isArray(value.statuses) ? value.statuses : [];

        // Build wa_id -> name map
        const nameByWaId: Record<string, string> = {};
        for (const c of contacts) {
          if (c?.wa_id && c?.profile?.name) nameByWaId[c.wa_id] = c.profile.name;
        }

        // Process messages (inbound from customer OR echo of outbound from seller)
        for (const msg of messages) {
          const fromWaId = String(msg.from || "");
          if (!fromWaId) continue;

          // Determine direction:
          // - Echo events are always outbound (from the seller's number)
          // - For regular messages, if "from" matches our own number, treat as outbound (some providers route this way)
          const fromIsOurs =
            (ourPhoneNumberId && fromWaId === ourPhoneNumberId) ||
            (ourDisplayNumber && fromWaId.replace(/\D/g, "") === ourDisplayNumber);
          const direction: "inbound" | "outbound" = isEcho || fromIsOurs ? "outbound" : "inbound";

          // Contact phone is the customer's number:
          // - inbound: msg.from
          // - outbound/echo: recipient (msg.to or first contact wa_id)
          let phone = fromWaId;
          if (direction === "outbound") {
            const toWaId = String(msg.to || "");
            const firstContactWaId = contacts[0]?.wa_id ? String(contacts[0].wa_id) : "";
            phone = toWaId || firstContactWaId || fromWaId;
          }

          const inboundContactName = direction === "inbound" ? (nameByWaId[fromWaId] || "") : "";
          const msgTimestamp = parseSafeTimestamp(msg.timestamp);
          const msgType = msg.type || "text";

          let content = "";

          // AI config (lazy)
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
          } catch { /* defaults */ }

          if (msgType === "text") {
            content = msg.text?.body || "";
          } else if (msgType === "image") {
            const mediaId = msg.image?.id;
            const caption = msg.image?.caption || "";
            if (mediaId && accessToken) {
              const dl = await downloadMetaMedia(mediaId, accessToken);
              if (dl && aiKey) {
                content = await describeImage(dl.base64, aiKey, dl.mimetype, aiEndpoint, aiModel);
              } else {
                content = caption ? `📷 [Imagem]: ${caption}` : "[📷 Imagem recebida]";
              }
            } else {
              content = caption ? `📷 [Imagem]: ${caption}` : "[📷 Imagem recebida]";
            }
          } else if (msgType === "audio" || msgType === "voice") {
            const mediaId = msg.audio?.id || msg.voice?.id;
            const mime = msg.audio?.mime_type || msg.voice?.mime_type || "audio/ogg";
            if (mediaId && accessToken) {
              const dl = await downloadMetaMedia(mediaId, accessToken);
              if (dl && aiKey) {
                content = await transcribeAudio(dl.base64, aiKey, dl.mimetype || mime, aiEndpoint, aiModel);
              } else {
                content = "[🎵 Áudio recebido]";
              }
            } else {
              content = "[🎵 Áudio recebido]";
            }
          } else if (msgType === "video") {
            const caption = msg.video?.caption || "";
            content = caption ? `🎬 [Vídeo]: ${caption}` : "[Enviado uma mídia não suportada]";
          } else if (msgType === "document") {
            const fileName = msg.document?.filename || "documento";
            const docMime = msg.document?.mime_type || "";
            const mediaId = msg.document?.id;
            const isPdf = docMime.toLowerCase().includes("pdf") || fileName.toLowerCase().endsWith(".pdf");
            if (isPdf && mediaId && accessToken) {
              const dl = await downloadMetaMedia(mediaId, accessToken);
              if (dl?.base64 && dl.base64.length > 100) {
                try {
                  const pdfResp = await fetch(`${SUPABASE_URL}/functions/v1/pdf-extract`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    },
                    body: JSON.stringify({ pdf_base64: dl.base64, file_name: fileName, user_id: userId }),
                  });
                  const pdfJson = await pdfResp.json();
                  content = pdfJson?.message || `📄 [PDF]: ${fileName}`;
                } catch (e) {
                  console.error("PDF extract failed:", e);
                  content = `📄 [PDF]: ${fileName} — Erro ao processar.`;
                }
              } else {
                content = `📄 [PDF]: ${fileName}`;
              }
            } else {
              content = fileName ? `📎 [Documento]: ${fileName}` : "[Enviado uma mídia não suportada]";
            }
          } else if (msgType === "sticker") {
            content = "[🎨 Figurinha recebida]";
          } else if (msgType === "location") {
            content = "[📍 Localização compartilhada]";
          } else if (msgType === "contacts") {
            content = "[📇 Contato compartilhado]";
          } else if (msgType === "button") {
            content = msg.button?.text || "[Botão clicado]";
          } else if (msgType === "interactive") {
            content =
              msg.interactive?.button_reply?.title ||
              msg.interactive?.list_reply?.title ||
              "[Resposta interativa]";
          } else {
            content = "[Enviado uma mídia não suportada]";
          }

          if (!content) {
            console.log("Stevo Oficial: empty content for msg type", msgType);
            continue;
          }

          // Find or create conversation
          let { data: conversation } = await supabase
            .from("conversations")
            .select("id, unread_count, contact_name")
            .eq("user_id", userId)
            .eq("workspace_id", workspaceId)
            .eq("contact_phone", phone)
            .maybeSingle();

          const displayMessage = content.length > 100 ? content.slice(0, 100) + "..." : content;
          const effectiveContactName = inboundContactName || phone;

          if (!conversation) {
            const { data: newConv } = await supabase
              .from("conversations")
              .insert({
                user_id: userId,
                workspace_id: workspaceId,
                contact_name: effectiveContactName,
                contact_phone: phone,
                last_message: displayMessage,
                last_message_at: msgTimestamp,
                unread_count: direction === "inbound" ? 1 : 0,
                integration_type: "stevo_oficial",
                integration_label: integrationLabel,
              })
              .select("id, unread_count, contact_name")
              .single();
            conversation = newConv;
          } else {
            const updateData: Record<string, unknown> = {
              last_message: displayMessage,
              last_message_at: msgTimestamp,
              integration_type: "stevo_oficial",
              integration_label: integrationLabel,
            };
            if (direction === "inbound") {
              updateData.unread_count = (conversation.unread_count || 0) + 1;
              if (inboundContactName) updateData.contact_name = inboundContactName;
            }
            await supabase.from("conversations").update(updateData).eq("id", conversation.id);
          }

          if (conversation) {
            await supabase.from("messages").insert({
              conversation_id: conversation.id,
              direction,
              content,
              created_at: msgTimestamp,
            });

            // Debounce + analyze trigger only for inbound (customer) messages
            if (direction === "inbound") {
              const DEBOUNCE_MS = 8 * 60 * 1000;
              const CEILING_MS = 20 * 60 * 1000;
              const now = new Date();

              const { data: convDebounce } = await supabase
                .from("conversations")
                .select("analyze_started_at")
                .eq("id", conversation.id)
                .single();

              const analyzeStartedAt = convDebounce?.analyze_started_at
                ? new Date(convDebounce.analyze_started_at)
                : null;
              const ceilingReached = analyzeStartedAt && (now.getTime() - analyzeStartedAt.getTime() >= CEILING_MS);

              if (ceilingReached) {
                await supabase
                  .from("conversations")
                  .update({ analyze_after: null, analyze_started_at: null })
                  .eq("id", conversation.id);
                fetch(`${SUPABASE_URL}/functions/v1/ai-analyze`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  },
                  body: JSON.stringify({ conversation_id: conversation.id, user_id: userId }),
                }).catch((e) => console.error("AI analyze trigger failed:", e));
              } else {
                const analyzeAfter = new Date(now.getTime() + DEBOUNCE_MS).toISOString();
                const updateData: Record<string, unknown> = { analyze_after: analyzeAfter };
                if (!analyzeStartedAt) updateData.analyze_started_at = now.toISOString();
                await supabase.from("conversations").update(updateData).eq("id", conversation.id);
              }
            }

            console.log(`Stevo Oficial ${direction} message saved:`, conversation.id);
          }
        }

        // Status updates (delivered/read/sent) — only log for now
        for (const st of statuses) {
          console.log("Stevo Oficial status:", st.status, "for", st.recipient_id);
        }
      }
    }
  } catch (error) {
    console.error("Stevo Oficial webhook processing error:", error);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const okResponse = new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  try {
    const url = new URL(req.url);
    const integrationId = url.searchParams.get("id");

    // Meta-style verification challenge (GET)
    if (req.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode === "subscribe" && challenge) {
        return new Response(challenge, { headers: corsHeaders, status: 200 });
      }
      return okResponse;
    }

    if (!integrationId) {
      console.log("Stevo Oficial webhook: no ?id= parameter, URL:", req.url);
      return okResponse;
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      console.log("Stevo Oficial webhook: invalid JSON");
      return okResponse;
    }

    const instanceHeader = req.headers.get("x-stevo-instance") || "";

    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime?.waitUntil) {
      runtime.waitUntil(processWebhook(payload, integrationId, instanceHeader));
    } else {
      processWebhook(payload, integrationId, instanceHeader).catch((e) =>
        console.error("Stevo Oficial background error:", e)
      );
    }

    return okResponse;
  } catch (error) {
    console.error("Stevo Oficial webhook error:", error);
    await reportEdgeError("edge:stevo-oficial-webhook", error);
    return okResponse;
  }
});
