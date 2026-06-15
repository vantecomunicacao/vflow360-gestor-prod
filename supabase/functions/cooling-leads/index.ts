// VFlowGHL — cooling-leads
// Calcula APENAS os "leads esfriando" (oportunidades abertas sem atividade há
// X dias), isolando os dados sensíveis do dashboard do gestor. Para vendedores
// (com vínculo em user_ghl_links) o escopo é FORÇADO ao ghl_user_id dele.
//
// Atividade = o mais recente entre a última mudança de etapa
// (last_status_change_at, fallback ghl_created_at) e a última mensagem trocada.
// Faixas não-sobrepostas: 7–9 / 10–13 / 14+.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DAY = 86_400_000;
const COOLING_THRESHOLDS = { warning: 7, alert: 10, critical: 14 };

const normalizePhone = (p: string | null | undefined) => (p || "").replace(/\D+/g, "");
const isWonName = (n: string) => /(ganho|ganha|won|venda)/.test((n || "").toLowerCase());

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");
    const token = authHeader.replace("Bearer ", "");

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: claimsData, error: cErr } = await userClient.auth.getClaims(token);
    if (cErr || !claimsData?.claims) throw new Error("Unauthorized");
    const userId = claimsData.claims.sub as string;

    const payload = await req.json().catch(() => ({} as any));
    const workspaceId = payload.workspace_id as string;
    if (!workspaceId) throw new Error("workspace_id is required");
    const filterPipelineId: string | null = payload.pipelineId || null;

    const { data: isMember } = await supabase.rpc("is_workspace_member", {
      _user_id: userId, _workspace_id: workspaceId,
    });
    if (!isMember) throw new Error("Forbidden");

    // Escopo do vendedor: se houver vínculo em user_ghl_links, FORÇA o filtro
    // ao ghl_user_id dele (ignora qualquer sellerId vindo do cliente).
    let forcedSellerId: string | null = null;
    const { data: linkRow } = await supabase
      .from("user_ghl_links")
      .select("ghl_user_id")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (linkRow?.ghl_user_id) forcedSellerId = linkRow.ghl_user_id as string;

    // Stages "ganhas" para excluir do "aberto" (por nome + won_stage_keys).
    const [{ data: pipelinesRows }, { data: settingsRow }, { data: usersRows }] = await Promise.all([
      supabase.from("ghl_pipelines").select("ghl_id,name,stages").eq("workspace_id", workspaceId),
      supabase.from("ghl_dashboard_settings").select("won_stage_keys").eq("workspace_id", workspaceId).maybeSingle(),
      supabase.from("ghl_users").select("ghl_id,name").eq("workspace_id", workspaceId),
    ]);

    const wonStageIds = new Set<string>();
    for (const p of (pipelinesRows || []) as any[]) {
      const stages = Array.isArray(p.stages) ? p.stages : [];
      for (const s of stages) {
        if (isWonName(s.name)) wonStageIds.add(s.id);
      }
    }
    const wonKeys: string[] = Array.isArray((settingsRow as any)?.won_stage_keys) ? (settingsRow as any).won_stage_keys : [];
    for (const k of wonKeys) if (k && k !== "venda_ganha") wonStageIds.add(k);

    const sellerNameById = new Map<string, string>();
    for (const u of (usersRows || []) as any[]) sellerNameById.set(u.ghl_id, u.name);

    // Oportunidades (sem filtro de data; aplica pipeline e escopo de vendedor).
    let q = supabase
      .from("ghl_opportunities")
      .select("ghl_id,name,stage_id,status,assigned_to,ghl_created_at,last_status_change_at,contact_phone")
      .eq("workspace_id", workspaceId)
      .limit(10000);
    if (filterPipelineId) q = q.eq("pipeline_id", filterPipelineId);
    if (forcedSellerId) q = q.eq("assigned_to", forcedSellerId);
    const { data: openRows, error: oppErr } = await q;
    if (oppErr) throw oppErr;

    const nowMs = Date.now();
    const isOpen = (o: any) => {
      const st = (o.status || "").toLowerCase();
      if (st === "lost" || st === "won") return false;
      if (o.stage_id && wonStageIds.has(o.stage_id)) return false;
      return true;
    };

    // Candidatos: abertas paradas (por etapa/criação) há >= warning dias.
    const candidates: Array<{ phone: string; baseMs: number; name: string; seller: string | null }> = [];
    for (const o of (openRows || [])) {
      if (!isOpen(o)) continue;
      const baseStr = o.last_status_change_at || o.ghl_created_at;
      if (!baseStr) continue;
      const baseMs = new Date(baseStr).getTime();
      if (isNaN(baseMs)) continue;
      if ((nowMs - baseMs) / DAY < COOLING_THRESHOLDS.warning) continue;
      candidates.push({
        phone: normalizePhone(o.contact_phone),
        baseMs,
        name: o.name || `Oportunidade ${String(o.ghl_id).slice(0, 6)}`,
        seller: o.assigned_to ? (sellerNameById.get(o.assigned_to) || null) : null,
      });
    }

    // Última mensagem por telefone dos candidatos (janela de 90 dias).
    const candPhones = new Set(candidates.map((c) => c.phone).filter(Boolean));
    const lastMsgByPhone = new Map<string, number>();
    if (candPhones.size > 0) {
      const convIdToPhone = new Map<string, string>();
      const coolConvIds: string[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data: convsRows, error: convErr } = await supabase
          .from("ghl_conversations")
          .select("ghl_conversation_id,contact_phone")
          .eq("workspace_id", workspaceId)
          .range(from, from + PAGE - 1);
        if (convErr) { console.error("[cooling] ghl_conversations error", convErr); break; }
        const rows = convsRows || [];
        for (const c of rows) {
          const phone = normalizePhone((c as any).contact_phone);
          if (!candPhones.has(phone)) continue;
          const id = (c as any).ghl_conversation_id as string;
          if (convIdToPhone.has(id)) continue;
          convIdToPhone.set(id, phone);
          coolConvIds.push(id);
        }
        if (rows.length < PAGE) break;
        from += PAGE;
        if (from > 50000) break; // safety
      }

      if (coolConvIds.length > 0) {
        const sinceIso = new Date(nowMs - 90 * DAY).toISOString();
        const ID_CHUNK = 200;
        const MSG_PAGE = 1000;
        for (let i = 0; i < coolConvIds.length; i += ID_CHUNK) {
          const chunk = coolConvIds.slice(i, i + ID_CHUNK);
          let mFrom = 0;
          while (true) {
            const { data: msgsRows, error: msgErr } = await supabase
              .from("ghl_messages")
              .select("ghl_conversation_id,date_added")
              .eq("workspace_id", workspaceId)
              .in("ghl_conversation_id", chunk)
              .gte("date_added", sinceIso)
              .order("date_added", { ascending: false })
              .range(mFrom, mFrom + MSG_PAGE - 1);
            if (msgErr) { console.error("[cooling] ghl_messages error", msgErr); break; }
            const rows = (msgsRows || []) as any[];
            for (const m of rows) {
              const phone = convIdToPhone.get(m.ghl_conversation_id);
              if (!phone) continue;
              const t = new Date(m.date_added).getTime();
              if (isNaN(t)) continue;
              if (t > (lastMsgByPhone.get(phone) || 0)) lastMsgByPhone.set(phone, t);
            }
            if (rows.length < MSG_PAGE) break;
            mFrom += MSG_PAGE;
            if (mFrom > 100000) break; // safety
          }
        }
      }
    }

    type CoolingLead = { name: string; seller: string | null; days: number };
    const result = {
      warning: 0, alert: 0, critical: 0, total: 0,
      thresholds: COOLING_THRESHOLDS,
      leads: { warning: [] as CoolingLead[], alert: [] as CoolingLead[], critical: [] as CoolingLead[] },
      scope: forcedSellerId ? "seller" : "workspace",
    };

    for (const c of candidates) {
      const effMs = Math.max(c.baseMs, c.phone ? (lastMsgByPhone.get(c.phone) || 0) : 0);
      const days = (nowMs - effMs) / DAY;
      if (days < COOLING_THRESHOLDS.warning) continue;
      result.total++;
      const bucket: "warning" | "alert" | "critical" =
        days >= COOLING_THRESHOLDS.critical ? "critical"
        : days >= COOLING_THRESHOLDS.alert ? "alert"
        : "warning";
      result[bucket]++;
      result.leads[bucket].push({ name: c.name, seller: c.seller, days: Math.floor(days) });
    }
    for (const k of ["warning", "alert", "critical"] as const) {
      result.leads[k].sort((a, b) => b.days - a.days);
      if (result.leads[k].length > 100) result.leads[k] = result.leads[k].slice(0, 100);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("cooling-leads error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
