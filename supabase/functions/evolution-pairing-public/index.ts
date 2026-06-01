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

// Considera "nova abertura" se nunca acessou ou se a última vista foi há +5 min.
// Evita contar cada poll (que roda a cada 4s) como uma abertura nova.
const SESSION_WINDOW_MS = 5 * 60 * 1000;
function isNewSession(lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return true;
  const last = new Date(lastSeenAt).getTime();
  if (Number.isNaN(last)) return true;
  return Date.now() - last > SESSION_WINDOW_MS;
}

// Formata um JID do WhatsApp (`5511999999999@s.whatsapp.net`) em string amigável.
function formatPhone(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const digits = jid.split("@")[0].replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.startsWith("55") && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9) return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    if (rest.length === 8) return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return `+${digits}`;
}

async function fetchPairedProfile(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
): Promise<{ paired_name: string | null; paired_phone: string | null }> {
  try {
    const resp = await fetch(
      `${baseUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
      { method: "GET", headers: { apikey: apiKey } },
    );
    if (!resp.ok) return { paired_name: null, paired_phone: null };
    const data = await resp.json().catch(() => null);
    const entry = Array.isArray(data) ? data[0] : data?.instance ?? data;
    const profileName = entry?.profileName || entry?.instance?.profileName || null;
    const ownerJid =
      entry?.ownerJid || entry?.owner || entry?.instance?.owner || entry?.number || null;
    return { paired_name: profileName, paired_phone: formatPhone(ownerJid) };
  } catch {
    return { paired_name: null, paired_phone: null };
  }
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
      .select("id, integration_id, workspace_id, revoked_at, use_count, max_uses, expires_at, last_paired_at, last_seen_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!row || row.revoked_at) {
      return ok({ ok: false, reason: "invalid_or_expired" }, cors);
    }

    // expires_at e max_uses são opcionais (tokens antigos têm NULL e seguem
    // sem expiração, como antes). Para tokens novos, ambos são populados pelo
    // evolution-manage no momento da criação.
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      return ok({ ok: false, reason: "invalid_or_expired" }, cors);
    }

    // Telemetria: incrementa use_count só em nova sessão (gap > 5 min);
    // last_seen_at é atualizado a cada poll. Não bloqueia se falhar.
    const userAgent = (req.headers.get("user-agent") || "").slice(0, 200);
    const newSession = isNewSession(row.last_seen_at);

    // Bloqueia abertura de NOVA sessão se o limite de usos foi atingido.
    // Sessão em andamento (polls dentro de SESSION_WINDOW_MS) continua, para
    // não derrubar o cliente no meio do scan do QR.
    if (newSession && row.max_uses && (row.use_count || 0) >= row.max_uses) {
      return ok({ ok: false, reason: "invalid_or_expired" }, cors);
    }

    const telemetryUpdate: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
    if (newSession) telemetryUpdate.use_count = (row.use_count || 0) + 1;
    supabase
      .from("integration_pairing_tokens")
      .update(telemetryUpdate)
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

      const profile = await fetchPairedProfile(EVOLUTION_BASE_URL, EVOLUTION_API_KEY, cfg.instanceName);

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
            paired_name: profile.paired_name,
            paired_phone: profile.paired_phone,
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
          paired_name: profile.paired_name,
          paired_phone: profile.paired_phone,
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