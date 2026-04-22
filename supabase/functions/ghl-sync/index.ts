// VFlowGHL — ghl-sync
// Sincroniza pipelines, users, custom fields, lost reasons e opportunities do GHL
// para tabelas locais (snapshot). Aceita JWT do usuário OU SERVICE_ROLE (cron).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

interface GhlCreds {
  apiKey: string;
  locationId: string;
}

async function ghlFetch(path: string, creds: GhlCreds, init: RequestInit = {}) {
  const url = path.startsWith("http") ? path : `${GHL_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      "Content-Type": "application/json",
      Version: GHL_VERSION,
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) {
    throw new Error(`GHL ${res.status} on ${path}: ${typeof json === "string" ? json : JSON.stringify(json)}`);
  }
  return json;
}

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
    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === SERVICE_KEY;

    const payload = await req.json().catch(() => ({} as Record<string, unknown>));
    const workspaceId = (payload.workspace_id as string) || null;
    if (!workspaceId) throw new Error("workspace_id is required");
    workspaceIdForStatus = workspaceId;

    let userId: string | null = null;
    if (isServiceRole) {
      // Para cron / chamada interna: precisamos saber o owner do workspace para olhar a integration
      const { data: ws, error: wsErr } = await supabase
        .from("workspaces").select("owner_id").eq("id", workspaceId).single();
      if (wsErr || !ws) throw new Error("Workspace not found");
      userId = ws.owner_id as string;
    } else {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: claimsData, error: cErr } = await userClient.auth.getClaims(token);
      if (cErr || !claimsData?.claims) throw new Error("Unauthorized");
      userId = claimsData.claims.sub;

      // Confirma que o usuário é membro do workspace
      const { data: isMember } = await supabase.rpc("is_workspace_member", {
        _user_id: userId, _workspace_id: workspaceId,
      });
      if (!isMember) throw new Error("Forbidden: not a member of this workspace");
    }

    // Rate limiting: bloqueia se já está rodando OU se sync manual foi há menos de 2min
    // (cron via SERVICE_ROLE ignora o cooldown de 2min)
    const { data: currentStatus } = await supabase
      .from("ghl_sync_status")
      .select("is_running, last_sync_at, updated_at")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (currentStatus?.is_running) {
      // Auto-recovery: se está "rodando" há mais de 10min, considera travado e libera
      const updatedAt = currentStatus.updated_at ? new Date(currentStatus.updated_at).getTime() : 0;
      const stuckMs = Date.now() - updatedAt;
      if (stuckMs < 10 * 60 * 1000) {
        return new Response(
          JSON.stringify({ error: "Sincronização já em andamento. Aguarde a conclusão.", code: "ALREADY_RUNNING" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    if (!isServiceRole && currentStatus?.last_sync_at) {
      const elapsedMs = Date.now() - new Date(currentStatus.last_sync_at).getTime();
      const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutos
      if (elapsedMs < COOLDOWN_MS) {
        const waitSec = Math.ceil((COOLDOWN_MS - elapsedMs) / 1000);
        return new Response(
          JSON.stringify({
            error: `Aguarde ${waitSec}s antes de sincronizar novamente.`,
            code: "COOLDOWN",
            retryAfterSec: waitSec,
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Marca sync como rodando
    await supabase.from("ghl_sync_status").upsert({
      workspace_id: workspaceId,
      is_running: true,
      last_sync_status: "running",
      last_sync_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id" });

    // Busca a integração GHL conectada deste workspace
    const { data: integration, error: iErr } = await supabase
      .from("integrations").select("config, status, user_id")
      .eq("type", "ghl").eq("workspace_id", workspaceId)
      .eq("status", "connected").maybeSingle();
    if (iErr) throw iErr;
    if (!integration) throw new Error("Nenhuma integração GHL conectada neste workspace");

    const cfg = (integration.config || {}) as Record<string, any>;
    const apiKey = cfg.apiKey || cfg.api_key;
    const locationId = cfg.locationId || cfg.location_id;
    if (!apiKey || !locationId) throw new Error("Credenciais GHL incompletas (apiKey/locationId)");
    const creds: GhlCreds = { apiKey, locationId };

    // === 1. Pipelines ===
    const pipelinesResp = await ghlFetch(`/opportunities/pipelines?locationId=${locationId}`, creds);
    const pipelines = pipelinesResp?.pipelines || [];
    if (pipelines.length) {
      const rows = pipelines.map((p: any) => ({
        workspace_id: workspaceId,
        ghl_id: p.id,
        name: p.name || "Sem nome",
        stages: p.stages || [],
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from("ghl_pipelines")
        .upsert(rows, { onConflict: "workspace_id,ghl_id" });
      if (error) throw error;
    }

    // === 2. Users (location users) ===
    try {
      const usersResp = await ghlFetch(`/users/?locationId=${locationId}`, creds);
      const users = usersResp?.users || [];
      if (users.length) {
        const rows = users.map((u: any) => ({
          workspace_id: workspaceId,
          ghl_id: u.id,
          name: u.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Sem nome",
          email: u.email || null,
          updated_at: new Date().toISOString(),
        }));
        const { error } = await supabase.from("ghl_users")
          .upsert(rows, { onConflict: "workspace_id,ghl_id" });
        if (error) throw error;
      }
    } catch (e) {
      console.warn("users sync failed:", (e as Error).message);
    }

    // === 3. Custom fields (contact + opportunity) ===
    try {
      const allFields: any[] = [];
      for (const model of ["contact", "opportunity"]) {
        try {
          const cfResp = await ghlFetch(
            `/locations/${locationId}/customFields?model=${model}`,
            creds,
          );
          const fields = cfResp?.customFields || [];
          for (const f of fields) {
            allFields.push({ ...f, _model: f.model || model });
          }
        } catch (e) {
          console.warn(`custom fields sync (${model}) failed:`, (e as Error).message);
        }
      }
      if (allFields.length) {
        const rows = allFields.map((f: any) => ({
          workspace_id: workspaceId,
          ghl_id: f.id,
          name: f.name || "Sem nome",
          field_key: f.fieldKey || null,
          model: f._model || f.model || null,
          data_type: f.dataType || null,
          picklist_options: f.picklistOptions || null,
          updated_at: new Date().toISOString(),
        }));
        const { error } = await supabase.from("ghl_custom_fields")
          .upsert(rows, { onConflict: "workspace_id,ghl_id" });
        if (error) throw error;
      }
    } catch (e) {
      console.warn("custom fields sync failed:", (e as Error).message);
    }

    // === 4. Lost reasons ===
    // GHL API v2 endpoint: /opportunities/lost-reason?locationId=XXX (camelCase!)
    // Doc: https://marketplace.gohighlevel.com/docs/ghl/opportunities/get-lost-reason
    // Importante: o parâmetro DEVE ser locationId (camelCase). location_id retorna 400.
    const lossReasonEndpoints = [
      `/opportunities/lost-reason?locationId=${locationId}`,
    ];
    let lossReasonsFetched = false;
    for (const ep of lossReasonEndpoints) {
      try {
        const lrResp = await ghlFetch(ep, creds);
        const reasons =
          lrResp?.lostReasons ||
          lrResp?.loss_reasons ||
          lrResp?.lossReasons ||
          lrResp?.data ||
          (Array.isArray(lrResp) ? lrResp : []);
        if (Array.isArray(reasons) && reasons.length) {
          const rows = reasons
            .filter((r: any) => r && r.id)
            .map((r: any) => ({
              workspace_id: workspaceId,
              ghl_id: r.id,
              name: r.name || r.reason || "Sem nome",
              updated_at: new Date().toISOString(),
            }));
          if (rows.length) {
            const { error } = await supabase.from("ghl_loss_reasons")
              .upsert(rows, { onConflict: "workspace_id,ghl_id" });
            if (error) throw error;
            console.log(`loss reasons synced via ${ep}: ${rows.length}`);
            lossReasonsFetched = true;
            break;
          }
        }
      } catch (e) {
        console.warn(`loss reasons attempt failed (${ep}):`, (e as Error).message);
      }
    }
    if (!lossReasonsFetched) {
      console.warn("loss reasons: nenhum endpoint funcionou — fallback usará nomes vindos das oportunidades.");
    }

    // === 5. Opportunities (paginação) ===
    let totalOpps = 0;
    const pageLimit = 100;
    const maxPages = 50; // safety: 5000 opportunities
    let nextPageUrl: string | null = null;
    let page = 0;
    // Fallback: coleta nomes de motivos de perda direto das oportunidades
    const lostReasonsFromOpps = new Map<string, string>();

    do {
      page++;
      const url = nextPageUrl
        ? nextPageUrl
        : `/opportunities/search?location_id=${locationId}&limit=${pageLimit}`;
      const resp: any = await ghlFetch(url, creds);
      const opps: any[] = resp?.opportunities || [];
      if (opps.length) {
        const rows = opps.map((o: any) => {
          const lostId = o.lostReasonId || o.lost_reason_id || o.lostReason?.id || null;
          const lostName = o.lostReasonName || o.lost_reason_name || o.lostReason?.name || null;
          if (lostId && lostName) lostReasonsFromOpps.set(lostId, lostName);
          return {
            workspace_id: workspaceId,
            ghl_id: o.id,
            name: o.name || null,
            pipeline_id: o.pipelineId || null,
            stage_id: o.pipelineStageId || o.stageId || null,
            status: o.status || null,
            monetary_value: typeof o.monetaryValue === "number" ? o.monetaryValue : null,
            source: o.source || null,
            contact_id: o.contactId || o.contact?.id || null,
            contact_name: o.contact?.name || null,
            contact_phone: o.contact?.phone || null,
            contact_email: o.contact?.email || null,
            assigned_to: o.assignedTo || null,
            lost_reason_id: lostId,
            custom_fields: o.customFields || {},
            ghl_created_at: o.createdAt || o.dateAdded || null,
            ghl_updated_at: o.updatedAt || null,
            last_status_change_at: o.lastStatusChangeAt || o.lastStageChangeAt || null,
            updated_at: new Date().toISOString(),
          };
        });
        const { error } = await supabase.from("ghl_opportunities")
          .upsert(rows, { onConflict: "workspace_id,ghl_id" });
        if (error) throw error;
        totalOpps += rows.length;
      }
      nextPageUrl = resp?.meta?.nextPageUrl || null;
    } while (nextPageUrl && page < maxPages);

    // === 6. Persiste motivos de perda capturados das oportunidades (fallback) ===
    if (lostReasonsFromOpps.size > 0) {
      const fallbackRows = Array.from(lostReasonsFromOpps.entries()).map(([id, name]) => ({
        workspace_id: workspaceId,
        ghl_id: id,
        name,
        updated_at: new Date().toISOString(),
      }));
      const { error: lrErr } = await supabase.from("ghl_loss_reasons")
        .upsert(fallbackRows, { onConflict: "workspace_id,ghl_id" });
      if (lrErr) console.warn("loss reasons fallback upsert failed:", lrErr.message);
      else console.log(`loss reasons fallback from opps: ${fallbackRows.length}`);
    }

    // === 7. (removido) ===
    // O endpoint individual /opportunities/lost-reason/{id} não existe na API GHL v2.
    // Os motivos vêm pela listagem (passo 4) e pelo fallback dos próprios opportunities (passo 6).

    const duration = Date.now() - startTs;
    await supabase.from("ghl_sync_status").upsert({
      workspace_id: workspaceId,
      last_sync_at: new Date().toISOString(),
      last_sync_status: "ok",
      last_sync_error: null,
      last_sync_duration_ms: duration,
      opportunities_count: totalOpps,
      is_running: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id" });

    return new Response(JSON.stringify({
      ok: true,
      workspace_id: workspaceId,
      opportunities_count: totalOpps,
      duration_ms: duration,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("ghl-sync error:", msg);
    if (workspaceIdForStatus) {
      await supabase.from("ghl_sync_status").upsert({
        workspace_id: workspaceIdForStatus,
        last_sync_status: "error",
        last_sync_error: msg,
        last_sync_duration_ms: Date.now() - startTs,
        is_running: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: "workspace_id" });
    }
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
