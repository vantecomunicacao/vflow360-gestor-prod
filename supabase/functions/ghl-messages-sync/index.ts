// Conversas 2.0 — sync de mensagens de UMA conversa do GHL para ghl_messages.
// Invocado lazy (ao abrir uma conversa na UI ou antes da IA analisar).
//
// Input: { workspace_id: string, ghl_conversation_id: string, max_messages?: number }
//   - max_messages default 100, teto 500.
// Auth: aceita service role, JWT autenticado (admin ou membro do workspace),
// ou anon key (cron interno). Mesmo padrao de ghl-conversations-sync.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { reportEdgeError } from "../_shared/error-reporter.ts";
import { syncConversationMessages } from "../_shared/ghl-sync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_MAX = 100;
const HARD_CAP = 500;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTs = Date.now();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let workspaceIdForStatus: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");
    const token = authHeader.replace("Bearer ", "").trim();
    let isServiceRole = token === SERVICE_KEY;
    if (!isServiceRole) {
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const payloadJson = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
          if (payloadJson?.role === "service_role") isServiceRole = true;
        }
      } catch (_) { /* ignore */ }
    }

    const payload = await req.json().catch(() => ({} as Record<string, unknown>));
    const workspaceId = (payload.workspace_id as string) || null;
    const ghlConversationId = (payload.ghl_conversation_id as string) || null;
    const requestedMax = Number(payload.max_messages) || DEFAULT_MAX;
    const maxMessages = Math.min(Math.max(1, requestedMax), HARD_CAP);
    if (!workspaceId) throw new Error("workspace_id e obrigatorio");
    if (!ghlConversationId) throw new Error("ghl_conversation_id e obrigatorio");
    workspaceIdForStatus = workspaceId;

    // Auth
    if (!isServiceRole) {
      let role = "unknown";
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const payloadJson = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
          role = payloadJson?.role || "unknown";
        }
      } catch (_) { /* invalid token shape -> rejeita abaixo */ }

      if (role === "authenticated") {
        const userClient = createClient(SUPABASE_URL, ANON_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: { user }, error: authError } = await userClient.auth.getUser();
        if (authError || !user) throw new Error("Unauthorized");
        const [{ data: isAdmin }, { data: isMember }] = await Promise.all([
          supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }),
          supabase.rpc("is_workspace_member", {
            _user_id: user.id,
            _workspace_id: workspaceId,
          }),
        ]);
        if (!isAdmin && !isMember) {
          throw new Error("Forbidden: nao e membro deste workspace");
        }
      } else if (role !== "anon") {
        throw new Error("Unauthorized");
      }
    }

    // Workspace ativo
    const { data: ws } = await supabase
      .from("workspaces")
      .select("id, deleted_at")
      .eq("id", workspaceId)
      .maybeSingle();
    if (!ws) throw new Error("Workspace nao encontrado");
    if (ws.deleted_at) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "workspace_deleted", workspace_id: workspaceId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Conversa local existe? (FK depende disso pra ghl_messages)
    const { data: convRow } = await supabase
      .from("ghl_conversations")
      .select("id, ghl_location_id")
      .eq("workspace_id", workspaceId)
      .eq("ghl_conversation_id", ghlConversationId)
      .maybeSingle();
    if (!convRow) {
      throw new Error(
        "Conversa nao encontrada em ghl_conversations. Rode ghl-conversations-sync primeiro.",
      );
    }

    // GHL credentials
    const { data: integration } = await supabase
      .from("integrations")
      .select("config, status")
      .eq("type", "ghl")
      .eq("workspace_id", workspaceId)
      .eq("status", "connected")
      .maybeSingle();
    if (!integration) throw new Error("Nenhuma integracao GHL conectada neste workspace");
    const cfg = (integration.config || {}) as Record<string, unknown>;
    const apiKey = (cfg.apiKey || cfg.api_key) as string;
    if (!apiKey) throw new Error("Credencial GHL incompleta (apiKey)");

    // Sync via modulo compartilhado (mesma logica usada inline pelo cron).
    const { synced: totalSynced, pages, maxDateAdded } = await syncConversationMessages(
      supabase,
      { workspaceId, ghlConversationId, apiKey, maxMessages },
    );

    // Avanca messages_synced_until (usado pelo tick do cron para detectar
    // inbound novo). Este caminho puxa as mensagens mais novas, entao maxDateAdded
    // e sempre o mais recente -> set direto.
    if (maxDateAdded) {
      await supabase
        .from("ghl_conversations")
        .update({ messages_synced_until: maxDateAdded })
        .eq("workspace_id", workspaceId)
        .eq("ghl_conversation_id", ghlConversationId);
    }

    const durationMs = Date.now() - startTs;

    // NOTA: enrichment NAO eh disparado aqui (edge->edge falha nesse Supabase).
    // O frontend chama ghl-enrich-attachments logo apos este sync (clique
    // "sincronizar"), e o tick do cron enriquece inline. Ver feedback-edge-fn-no-http.
    return new Response(
      JSON.stringify({
        ok: true,
        workspace_id: workspaceId,
        ghl_conversation_id: ghlConversationId,
        synced: totalSynced,
        pages,
        duration_ms: durationMs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = (err as Error).message || String(err);
    await reportEdgeError("ghl-messages-sync", err, {
      context: { workspace_id: workspaceIdForStatus },
    }).catch(() => {});
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
