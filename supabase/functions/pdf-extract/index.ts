import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Limits
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_PAGES = 50;
const MAX_CHARS = 50_000;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function base64ToBytes(b64: string): Uint8Array {
  const cleaned = b64.replace(/\s/g, "").replace(/^data:[^;]+;base64,/, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function summarizeWithAI(
  text: string,
  apiKey: string,
  endpoint: string,
  model: string,
  fileName: string,
): Promise<string> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "Você resume documentos PDF em português. Gere um resumo curto (2 a 4 frases) destacando o tipo do documento, o assunto principal e dados relevantes (nomes, valores, datas). Se houver tabelas ou números importantes, mencione-os. Retorne APENAS o resumo, sem títulos.",
          },
          {
            role: "user",
            content: `Arquivo: ${fileName}\n\nTexto extraído:\n${text}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI summary error:", response.status, await response.text());
      return "";
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  } catch (e) {
    console.error("AI summary failed:", e);
    return "";
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

    const body = await req.json();
    const {
      pdf_base64,
      pdf_url,
      file_name = "documento.pdf",
      user_id,
    } = body as {
      pdf_base64?: string;
      pdf_url?: string;
      file_name?: string;
      user_id?: string;
    };

    if (!pdf_base64 && !pdf_url) {
      return new Response(
        JSON.stringify({ error: "pdf_base64 or pdf_url required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Load PDF bytes
    let pdfBytes: Uint8Array;
    if (pdf_base64) {
      pdfBytes = base64ToBytes(pdf_base64);
    } else {
      const resp = await fetch(pdf_url!);
      if (!resp.ok) throw new Error(`Failed to fetch PDF URL: ${resp.status}`);
      pdfBytes = new Uint8Array(await resp.arrayBuffer());
    }

    const fileSize = pdfBytes.byteLength;
    console.log(`PDF received: ${file_name}, size: ${formatBytes(fileSize)}`);

    // Size guard
    if (fileSize > MAX_BYTES) {
      const message = `📄 [PDF]: ${file_name} (${formatBytes(fileSize)}) — Arquivo muito grande para análise automática (limite: 10 MB).`;
      return new Response(
        JSON.stringify({
          success: true,
          truncated: false,
          oversized: true,
          message,
          file_size: fileSize,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Resolve AI provider for this user
    let aiEndpoint = "https://ai.gateway.lovable.dev/v1/chat/completions";
    let aiKey = LOVABLE_API_KEY;
    let aiModel = "google/gemini-3-flash-preview";

    if (user_id) {
      try {
        const { data: providerCfg } = await supabase
          .from("ai_provider_config")
          .select("provider, api_key, model")
          .eq("user_id", user_id)
          .maybeSingle();
        if (providerCfg?.provider === "openai" && providerCfg?.api_key) {
          aiEndpoint = "https://api.openai.com/v1/chat/completions";
          aiKey = providerCfg.api_key;
          aiModel = providerCfg.model || "gpt-4o-mini";
        }
      } catch { /* defaults */ }
    }

    // Extract text
    let text = "";
    let totalPages = 0;
    let pagesUsed = 0;

    try {
      const pdf = await getDocumentProxy(pdfBytes);
      totalPages = pdf.numPages;
      pagesUsed = Math.min(totalPages, MAX_PAGES);
      console.log(`PDF pages: ${totalPages}, extracting first ${pagesUsed}`);

      const result = await extractText(pdf, { mergePages: false });
      const pageTexts = (result.text as string[]).slice(0, MAX_PAGES);
      text = pageTexts.join("\n\n").trim();
    } catch (e) {
      console.error("PDF text extraction failed:", e);
      const message = `📄 [PDF]: ${file_name} (${formatBytes(fileSize)}) — Não foi possível ler o conteúdo do PDF (pode ser um arquivo escaneado ou corrompido).`;
      return new Response(
        JSON.stringify({
          success: true,
          message,
          extraction_failed: true,
          file_size: fileSize,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Char limit
    let truncatedChars = false;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS);
      truncatedChars = true;
    }

    if (!text || text.trim().length < 20) {
      const message = `📄 [PDF]: ${file_name} (${formatBytes(fileSize)}, ${totalPages} pág) — PDF parece ser apenas imagens (escaneado). Texto não extraído.`;
      return new Response(
        JSON.stringify({
          success: true,
          message,
          empty: true,
          file_size: fileSize,
          total_pages: totalPages,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Summarize via AI
    const summary = await summarizeWithAI(text, aiKey, aiEndpoint, aiModel, file_name);

    const truncatedPages = totalPages > MAX_PAGES;
    const sizeNote = `${formatBytes(fileSize)}, ${totalPages} pág${truncatedPages ? ` (analisadas ${MAX_PAGES})` : ""}${truncatedChars ? ", texto truncado" : ""}`;

    const message = summary
      ? `📄 [PDF]: ${file_name} (${sizeNote})\n\nResumo: ${summary}`
      : `📄 [PDF]: ${file_name} (${sizeNote}) — Conteúdo extraído mas não foi possível resumir.`;

    return new Response(
      JSON.stringify({
        success: true,
        message,
        summary,
        text_preview: text.slice(0, 500),
        total_pages: totalPages,
        pages_used: pagesUsed,
        truncated_pages: truncatedPages,
        truncated_chars: truncatedChars,
        file_size: fileSize,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("pdf-extract error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
