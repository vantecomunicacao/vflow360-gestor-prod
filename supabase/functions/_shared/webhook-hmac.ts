// Verificação opt-in de assinatura HMAC para webhooks externos.
//
// Modelo de configuração (env vars por webhook):
//   <PREFIX>_HMAC_SECRET     — segredo compartilhado com o provedor
//   <PREFIX>_HMAC_MODE       — "off" (default), "log", "enforce"
//   <PREFIX>_HMAC_HEADER     — opcional, nome do header com a assinatura
//                              (default por provedor: ver verifyHmac)
//
// Em modo "log": loga válido/inválido em system_logs e segue normalmente.
// Em modo "enforce": rejeita request com 401 se assinatura ausente/inválida.
// Em modo "off" (ou env não setada): comportamento original, sem verificar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type HmacMode = "off" | "log" | "enforce";

export interface HmacConfig {
  /** Prefixo das envs, ex: "STEVO_OFICIAL", "EVOLUTION", "STEVO", "UAZAP". */
  prefix: string;
  /** Header default onde a assinatura é enviada. */
  defaultHeader: string;
  /**
   * Formato da assinatura recebida:
   *  - "hex": só hexadecimal (ex: "abc123…")
   *  - "sha256=hex": prefixado "sha256=" (Meta/X-Hub-Signature-256)
   *  - "base64": base64 puro
   */
  format: "hex" | "sha256=hex" | "base64";
}

function getMode(prefix: string): HmacMode {
  const raw = (Deno.env.get(`${prefix}_HMAC_MODE`) || "").toLowerCase().trim();
  if (raw === "log" || raw === "enforce") return raw;
  return "off";
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array | null {
  const s = hex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(s) || s.length % 2 !== 0) return null;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}

function base64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64.trim());
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function computeHmacSha256(secret: string, body: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return new Uint8Array(sig);
}

function parseSignature(raw: string, format: HmacConfig["format"]): Uint8Array | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (format === "sha256=hex") {
    const m = cleaned.match(/^sha256=([0-9a-f]+)$/i);
    return m ? hexToBytes(m[1]) : hexToBytes(cleaned);
  }
  if (format === "base64") return base64ToBytes(cleaned);
  return hexToBytes(cleaned);
}

async function logHmacEvent(
  source: string,
  level: "info" | "warning" | "error",
  message: string,
  context: Record<string, unknown>,
) {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    const supabase = createClient(url, key);
    await supabase.from("system_logs").insert({
      level,
      source: `${source}:hmac`,
      message,
      context,
      env: "edge",
    });
  } catch {
    // best-effort
  }
}

export interface HmacVerifyResult {
  mode: HmacMode;
  ok: boolean;
  /** Se mode=enforce e !ok, este Response deve ser retornado imediatamente. */
  reject?: Response;
}

/**
 * Verifica HMAC do webhook conforme config + envs. Retorna {ok, reject?}.
 * - mode="off": ok=true (não verifica).
 * - mode="log": verifica e loga; ok reflete o resultado, mas reject é undefined.
 * - mode="enforce": verifica; se inválido, retorna reject pronto (401).
 *
 * Caller deve passar o RAW body (string), não o JSON.parse — assinatura depende
 * da forma exata em que o provedor enviou.
 */
export async function verifyWebhookHmac(
  cfg: HmacConfig,
  req: Request,
  rawBody: string,
  source: string,
): Promise<HmacVerifyResult> {
  const mode = getMode(cfg.prefix);
  if (mode === "off") return { mode, ok: true };

  const secret = Deno.env.get(`${cfg.prefix}_HMAC_SECRET`) || "";
  if (!secret) {
    await logHmacEvent(source, "warning", "HMAC mode active but secret missing", {
      prefix: cfg.prefix,
      mode,
    });
    if (mode === "enforce") {
      return {
        mode,
        ok: false,
        reject: new Response(JSON.stringify({ error: "Server misconfigured" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      };
    }
    return { mode, ok: false };
  }

  const headerName = Deno.env.get(`${cfg.prefix}_HMAC_HEADER`) || cfg.defaultHeader;
  const received = req.headers.get(headerName) || "";
  const expectedBytes = await computeHmacSha256(secret, rawBody);
  const receivedBytes = parseSignature(received, cfg.format);

  const ok = !!receivedBytes && timingSafeEqual(receivedBytes, expectedBytes);

  await logHmacEvent(
    source,
    ok ? "info" : "warning",
    ok ? "HMAC valid" : "HMAC invalid or missing",
    {
      prefix: cfg.prefix,
      mode,
      header: headerName,
      header_present: received.length > 0,
      enforced: mode === "enforce",
    },
  );

  if (!ok && mode === "enforce") {
    return {
      mode,
      ok: false,
      reject: new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

  return { mode, ok };
}
