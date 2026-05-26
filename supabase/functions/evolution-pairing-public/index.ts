// Edge function pública (sem JWT) usada pela página /conectar/:token.
// O cliente final do operador abre o link, esta função valida o token,
// consulta o estado da instância na Evolution API e devolve o QR Code base64
// (ou status=connected) sem expor qualquer credencial.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { reportEdgeError } from "../_shared/error-reporter.ts";

const ALLOWED_ORIGINS = (Deno.env.get("PAIRING_ALLOWED_ORIGINS") ||
  "https://gestor.vflow360.com.br").split(",").map((o) => o.trim()).filter(Boolean);

function corsFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store, max-age=0",
  };
}

function ok(body: Record<string, unknown>, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function mapState(state: string | undefined | null): "connected" | "disconnected" | "connecting" {
  if (state === "open") return "connected";
  if (state === "connecting") return "connecting";
  return "disconnected";
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsFor(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  try {
    const EVOLUTION_BASE_URL = (Deno.env.get("EVOLUTION_BASE_URL") || "").replace(/\/+$/, "");
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!EVOLUTION_BASE_URL || !EVOLUTION_API_KEY) {
      return ok({ ok: false, reason: "invalid_or_expired" }, cors);
    }

    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token : "";
    if (token.length < 32 || token.length > 128) {
      return ok({ ok: false, reason: "invalid_or_expired" }, cors);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const tokenHash = await sha256Hex(token);

    const { data: row } = await supabase
      .from("integration_pairing_tokens")
      .select("id, integration_id, workspace_id, revoked_at, use_count, last_paired_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!row || row.revoked_at) {
      return ok({ ok: false, reason: "invalid_or_expired" }, cors);
    }

    // Atualiza telemetria (não bloqueia se falhar)
    const userAgent = (req.headers.get("user-agent") || "").slice(0, 200);
    supabase
      .from("integration_pairing_tokens")
      .update({
        use_count: (row.use_count || 0) + 1,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .then(() => {});

    // Busca integração (service role ignora RLS)
    const { data: integration } = await supabase
      .from("integrations")
      .select("id, status, config, workspace_id")
      .eq("id", row.integration_id)
      .maybeSingle();

    if (!integration) {
      return ok({ ok: false, reason: "invalid_or_expired" }, cors);
    }

    // Workspace não pode estar na lixeira
    const { data: ws } = await supabase
      .from("workspaces")
      .select("id, deleted_at")
      .eq("id", integration.workspace_id)
      .maybeSingle();
    if (!ws || ws.deleted_at) {
      return ok({ ok: false, reason: "invalid_or_expired" }, cors);
    }

    const cfg = (integration.config as { instanceName?: string; label?: string }) || {};
    if (!cfg.instanceName) {
      return ok({ ok: false, reason: "invalid_or_expired" }, cors);
    }

    const apiHeaders = { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY };

    // Consulta o estado atual da instância na Evolution
    const stateResp = await fetch(
      `${EVOLUTION_BASE_URL}/instance/connectionState/${encodeURIComponent(cfg.instanceName)}`,
      { method: "GET", headers: apiHeaders },
    );
    const stateData = await stateResp.json().catch(() => ({}));
    const mapped = mapState(stateData?.instance?.state || stateData?.state);

    if (mapped !== integration.status) {
      await supabase.from("integrations").update({ status: mapped }).eq("id", integration.id);
    }

    if (mapped === "connected") {
      // Marca o pareamento (link continua válido — reutilizável)
      await supabase
        .from("integration_pairing_tokens")
        .update({ last_paired_at: new Date().toISOString() })
        .eq("id", row.id);

      // Auditoria somente em transições para connected, evitando log a cada poll
      if (integration.status !== "connected") {
        await supabase.from("system_logs").insert({
          level: "info",
          source: "edge:evolution-pairing-public",
          message: "Pareamento concluído via magic link",
          context: {
            integration_id: integration.id,
            token_id: row.id,
            user_agent: userAgent,
          },
          workspace_id: integration.workspace_id,
          env: "edge",
        });
      }

      return ok(
        {
          ok: true,
          status: "connected",
          label: cfg.label || null,
        },
        cors,
      );
    }

    // Não conectado — busca QR fresco e força status connecting
    let qrcode: string | null = null;
    try {
      const qrResp = await fetch(
        `${EVOLUTION_BASE_URL}/instance/connect/${encodeURIComponent(cfg.instanceName)}`,
        { method: "GET", headers: apiHeaders },
      );
      if (qrResp.ok) {
        const qd = await qrResp.json().catch(() => ({}));
        qrcode = qd?.base64 || qd?.qrcode || qd?.code || null;
      }
    } catch {
      // Evolution offline — devolve sem QR; cliente verá "aguardando"
    }

    if (mapped !== "connecting") {
      await supabase.from("integrations").update({ status: "connecting" }).eq("id", integration.id);
    }

    return ok(
      {
        ok: true,
        status: "connecting",
        qrcode,
        label: cfg.label || null,
      },
      cors,
    );
  } catch (error) {
    await reportEdgeError("edge:evolution-pairing-public", error);
    return ok({ ok: false, reason: "invalid_or_expired" }, cors);
  }
});