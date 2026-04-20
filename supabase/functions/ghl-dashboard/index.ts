// VFlowGHL — ghl-dashboard
// Agrega dados de ghl_opportunities + pipelines + users + custom_fields + loss_reasons
// aplicando filtros (período, pipeline, vendedor, origem) e devolve DashboardData.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface FunnelMapping {
  contato_inicial: string[];
  proposta_enviada: string[];
  fechamento: string[];
  venda_ganha: string[];
}

const DAY_MS = 86_400_000;

function inferFunnelMapping(stages: Array<{ id: string; name: string }>): FunnelMapping {
  const out: FunnelMapping = { contato_inicial: [], proposta_enviada: [], fechamento: [], venda_ganha: [] };
  for (const s of stages) {
    const n = (s.name || "").toLowerCase();
    if (/(ganho|ganha|won|venda)/.test(n)) out.venda_ganha.push(s.id);
    else if (/(fechamento|closing|negocia)/.test(n)) out.fechamento.push(s.id);
    else if (/(proposta|proposal|enviada|sent)/.test(n)) out.proposta_enviada.push(s.id);
    else out.contato_inicial.push(s.id);
  }
  // se algum bucket ficou vazio, distribuir os primeiros stages
  if (!out.contato_inicial.length && stages[0]) out.contato_inicial.push(stages[0].id);
  return out;
}

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
    const userId = claimsData.claims.sub;

    const payload = await req.json().catch(() => ({} as any));
    const workspaceId = payload.workspace_id as string;
    if (!workspaceId) throw new Error("workspace_id is required");

    const { data: isMember } = await supabase.rpc("is_workspace_member", {
      _user_id: userId, _workspace_id: workspaceId,
    });
    if (!isMember) throw new Error("Forbidden");

    const startDate: string | null = payload.startDate || null;
    const endDate: string | null = payload.endDate || null;
    const filterPipelineId: string | null = payload.pipelineId || null;
    const filterUserId: string | null = payload.sellerId || null;
    const filterOrigin: string | null = payload.sourceOrigin || null;
    const additionalStartDate: string | null = payload.additionalStartDate || null;
    const additionalEndDate: string | null = payload.additionalEndDate || null;

    // ===== Carrega catálogos =====
    const [
      { data: pipelinesRows },
      { data: usersRows },
      { data: customFieldsRows },
      { data: lossReasonsRows },
      { data: settingsRow },
    ] = await Promise.all([
      supabase.from("ghl_pipelines").select("ghl_id,name,stages").eq("workspace_id", workspaceId),
      supabase.from("ghl_users").select("ghl_id,name").eq("workspace_id", workspaceId),
      supabase.from("ghl_custom_fields").select("ghl_id,name,field_key,model").eq("workspace_id", workspaceId),
      supabase.from("ghl_loss_reasons").select("ghl_id,name").eq("workspace_id", workspaceId),
      supabase.from("ghl_dashboard_settings").select("*").eq("workspace_id", workspaceId).maybeSingle(),
    ]);

    const allPipelines = (pipelinesRows || []) as Array<{ ghl_id: string; name: string; stages: any }>;
    const usersList = (usersRows || []) as Array<{ ghl_id: string; name: string }>;
    const customFieldDefs = (customFieldsRows || []) as Array<{ ghl_id: string; name: string; field_key: string | null; model: string | null }>;
    const lossReasonsList = (lossReasonsRows || []) as Array<{ ghl_id: string; name: string }>;
    const settings = settingsRow as any;

    // Pipelines ativos: se filtrado, só esse; senão TODOS (multi-pipeline)
    // Aplica default_pipeline_ids das settings quando usuário não filtrou
    const defaultPipelineIds: string[] = Array.isArray(settings?.default_pipeline_ids) ? settings.default_pipeline_ids : [];
    const activePipelines = filterPipelineId
      ? allPipelines.filter(p => p.ghl_id === filterPipelineId)
      : (defaultPipelineIds.length
          ? allPipelines.filter(p => defaultPipelineIds.includes(p.ghl_id))
          : allPipelines);
    // Agrega stages de TODOS os pipelines ativos
    const activeStages: Array<{ id: string; name: string }> = activePipelines.flatMap(
      (p) => (Array.isArray(p.stages) ? p.stages : []) as Array<{ id: string; name: string }>
    );
    const activePipelineIds = new Set(activePipelines.map(p => p.ghl_id));

    // Funnel mapping: aceita 2 formatos salvos
    //   A) {bucket: [stageIds]}  (legado)
    //   B) {stageId: "bucket"}    (formato salvo pela UI atual)
    const inferred = inferFunnelMapping(activeStages);
    const rawMapping = (settings?.funnel_stage_mapping || {}) as Record<string, any>;
    const VALID_BUCKETS = ["contato_inicial", "proposta_enviada", "fechamento", "venda_ganha"] as const;
    type BucketKey = typeof VALID_BUCKETS[number];

    const stageMap: FunnelMapping = { contato_inicial: [], proposta_enviada: [], fechamento: [], venda_ganha: [] };
    let hasUserMapping = false;

    // Tenta formato A
    for (const b of VALID_BUCKETS) {
      const v = rawMapping[b];
      if (Array.isArray(v) && v.length) {
        stageMap[b] = v.filter((x) => typeof x === "string");
        hasUserMapping = true;
      }
    }
    // Se não veio nada de A, tenta formato B (stageId → bucketKey)
    if (!hasUserMapping) {
      for (const [stageId, bucket] of Object.entries(rawMapping)) {
        if (typeof bucket === "string" && (VALID_BUCKETS as readonly string[]).includes(bucket)) {
          stageMap[bucket as BucketKey].push(stageId);
          hasUserMapping = true;
        }
      }
    }
    // Para qualquer bucket vazio, completa com inferência
    for (const b of VALID_BUCKETS) {
      if (!stageMap[b].length) stageMap[b] = inferred[b];
    }

    // won_stage_keys: aceita stage IDs OU bucket keys (ex: "venda_ganha")
    const rawWonKeys: string[] = Array.isArray(settings?.won_stage_keys) ? settings.won_stage_keys : [];
    const wonStageIds = new Set<string>(stageMap.venda_ganha);
    for (const k of rawWonKeys) {
      if ((VALID_BUCKETS as readonly string[]).includes(k)) {
        for (const sid of stageMap[k as BucketKey]) wonStageIds.add(sid);
      } else if (typeof k === "string") {
        wonStageIds.add(k);
      }
    }

    // Origin field name from settings (fallback "source")
    const originFieldName: string | null = settings?.origin_field_name || null;

    // ===== Query opportunities com filtros =====
    let q = supabase
      .from("ghl_opportunities")
      .select("ghl_id,name,pipeline_id,stage_id,status,monetary_value,source,assigned_to,lost_reason_id,custom_fields,ghl_created_at,last_status_change_at")
      .eq("workspace_id", workspaceId)
      .limit(10000);
    if (filterPipelineId) q = q.eq("pipeline_id", filterPipelineId);
    if (filterUserId) q = q.eq("assigned_to", filterUserId);
    if (startDate) q = q.gte("ghl_created_at", startDate);
    if (endDate) q = q.lte("ghl_created_at", endDate);
    const { data: oppsRows, error: oppsErr } = await q;
    if (oppsErr) throw oppsErr;
    let opps = (oppsRows || []) as any[];

    // Origem: source nativo ou custom field configurado
    const getOrigin = (o: any): string | null => {
      if (originFieldName && o.custom_fields) {
        const cf = o.custom_fields;
        // procura por id, fieldKey, ou name (case-insensitive)
        const direct = cf[originFieldName];
        if (direct) return String(direct);
        const def = customFieldDefs.find(d =>
          d.name?.toLowerCase() === originFieldName.toLowerCase() ||
          d.field_key === originFieldName ||
          d.ghl_id === originFieldName
        );
        if (def) {
          const v = cf[def.ghl_id] || cf[def.field_key || ""] || cf[def.name];
          if (v) return String(v);
        }
      }
      return o.source || null;
    };

    if (filterOrigin) {
      opps = opps.filter(o => getOrigin(o) === filterOrigin);
    }

    // Quando não há filtro de pipeline, restringe aos pipelines ativos (default_pipeline_ids ou todos)
    if (!filterPipelineId && activePipelineIds.size > 0) {
      opps = opps.filter(o => !o.pipeline_id || activePipelineIds.has(o.pipeline_id));
    }

    // ===== Filtro adicional por campo de data customizado =====
    const additionalDateFieldId: string | null = settings?.additional_date_field || null;
    const additionalDateFieldDef = additionalDateFieldId
      ? customFieldDefs.find(d => d.ghl_id === additionalDateFieldId || d.field_key === additionalDateFieldId)
      : null;
    const additionalDateFieldName: string | null = additionalDateFieldDef?.name || null;

    if (additionalDateFieldId && additionalStartDate && additionalEndDate) {
      const addStart = new Date(additionalStartDate).getTime();
      const addEnd = new Date(additionalEndDate).getTime();
      const parseDateVal = (v: any): number | null => {
        if (v == null || v === "") return null;
        if (typeof v === "number") {
          // Heurística: se for em segundos (10 dígitos), converte para ms
          const ms = v < 1e12 ? v * 1000 : v;
          const t = new Date(ms).getTime();
          return isNaN(t) ? null : t;
        }
        if (typeof v === "string") {
          // Tenta número primeiro
          const asNum = Number(v);
          if (!isNaN(asNum) && v.trim() !== "") {
            const ms = asNum < 1e12 ? asNum * 1000 : asNum;
            const t = new Date(ms).getTime();
            if (!isNaN(t)) return t;
          }
          const t = new Date(v).getTime();
          return isNaN(t) ? null : t;
        }
        return null;
      };
      opps = opps.filter((o) => {
        const cf = o.custom_fields || {};
        // tenta ghl_id, field_key e name
        const raw =
          cf[additionalDateFieldId] ??
          (additionalDateFieldDef?.field_key ? cf[additionalDateFieldDef.field_key] : undefined) ??
          (additionalDateFieldDef?.name ? cf[additionalDateFieldDef.name] : undefined);
        const t = parseDateVal(raw);
        if (t === null) return false;
        return t >= addStart && t <= addEnd;
      });
    }

    const totalLeads = opps.length;
    const wonOpps = opps.filter(o => wonStageIds.has(o.stage_id) || (o.status || "").toLowerCase() === "won");
    const lostOpps = opps.filter(o => (o.status || "").toLowerCase() === "lost");
    const lostLeads = lostOpps.length;

    const stageBucket = (stageId: string | null): keyof FunnelMapping | null => {
      if (!stageId) return null;
      if (stageMap.venda_ganha.includes(stageId)) return "venda_ganha";
      if (stageMap.fechamento.includes(stageId)) return "fechamento";
      if (stageMap.proposta_enviada.includes(stageId)) return "proposta_enviada";
      if (stageMap.contato_inicial.includes(stageId)) return "contato_inicial";
      return null;
    };

    // ===== Funnel stages (4 buckets) — exclui perdidos do funil =====
    const counts = { contato_inicial: 0, proposta_enviada: 0, fechamento: 0, venda_ganha: 0 };
    const leadsByBucket: Record<keyof FunnelMapping, Array<{ id: number; name: string }>> = {
      contato_inicial: [], proposta_enviada: [], fechamento: [], venda_ganha: [],
    };
    for (const o of opps) {
      if ((o.status || "").toLowerCase() === "lost") continue; // perdidos saem do funil
      const b = stageBucket(o.stage_id);
      if (b) {
        counts[b]++;
        if (leadsByBucket[b].length < 200) {
          leadsByBucket[b].push({ id: leadsByBucket[b].length, name: o.name || `Opp ${o.ghl_id.slice(0, 6)}` });
        }
      }
    }
    const funnelStages = [
      { id: "contato_inicial", name: "Contato Inicial", count: counts.contato_inicial, leads: leadsByBucket.contato_inicial },
      { id: "proposta_enviada", name: "Proposta Enviada", count: counts.proposta_enviada, leads: leadsByBucket.proposta_enviada },
      { id: "fechamento", name: "Fechamento", count: counts.fechamento, leads: leadsByBucket.fechamento },
      { id: "venda_ganha", name: "Venda Ganha", count: counts.venda_ganha, leads: leadsByBucket.venda_ganha },
    ];

    const safeRate = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
    const conversionRates = {
      contatoToProsposta: safeRate(counts.proposta_enviada, counts.contato_inicial),
      propostaToFechamento: safeRate(counts.fechamento, counts.proposta_enviada),
      fechamentoToVenda: safeRate(counts.venda_ganha, counts.fechamento),
      overallConversion: safeRate(counts.venda_ganha, counts.contato_inicial || totalLeads),
    };

    // ===== Sellers =====
    const sellersMap = new Map<string, { name: string; contatoInicial: number; propostaEnviada: number; fechamento: number; vendaGanha: number }>();
    for (const u of usersList) sellersMap.set(u.ghl_id, { name: u.name, contatoInicial: 0, propostaEnviada: 0, fechamento: 0, vendaGanha: 0 });
    for (const o of opps) {
      const b = stageBucket(o.stage_id);
      if (!b) continue;
      const userKey = o.assigned_to || "__unassigned__";
      let s = sellersMap.get(userKey);
      if (!s) {
        s = { name: userKey === "__unassigned__" ? "Não atribuído" : `Usuário ${userKey.slice(0, 6)}`, contatoInicial: 0, propostaEnviada: 0, fechamento: 0, vendaGanha: 0 };
        sellersMap.set(userKey, s);
      }
      if (b === "contato_inicial") s.contatoInicial++;
      if (b === "proposta_enviada") s.propostaEnviada++;
      if (b === "fechamento") s.fechamento++;
      if (b === "venda_ganha") s.vendaGanha++;
    }
    const sellers = Array.from(sellersMap.values()).filter(s => s.contatoInicial + s.propostaEnviada + s.fechamento + s.vendaGanha > 0);

    // ===== Lead origins =====
    const originsCount = new Map<string, number>();
    let originsFilled = 0;
    for (const o of opps) {
      const v = getOrigin(o);
      if (v) {
        originsFilled++;
        originsCount.set(v, (originsCount.get(v) || 0) + 1);
      }
    }
    const origemDistribution = Array.from(originsCount.entries())
      .map(([name, count]) => ({ name, count, percentage: safeRate(count, originsFilled) }))
      .sort((a, b) => b.count - a.count);
    const origemFillRate = safeRate(originsFilled, totalLeads);

    // Won origins
    const wonOriginsCount = new Map<string, number>();
    let wonOriginsFilled = 0;
    for (const o of wonOpps) {
      const v = getOrigin(o);
      if (v) {
        wonOriginsFilled++;
        wonOriginsCount.set(v, (wonOriginsCount.get(v) || 0) + 1);
      }
    }
    const wonOrigemDistribution = Array.from(wonOriginsCount.entries())
      .map(([name, count]) => ({ name, count, percentage: safeRate(count, wonOriginsFilled) }))
      .sort((a, b) => b.count - a.count);
    const wonOrigemFillRate = safeRate(wonOriginsFilled, wonOpps.length);

    // ===== Custom fields fill rate =====
    const visibleFields: string[] = settings?.visible_custom_fields?.length
      ? settings.visible_custom_fields
      : customFieldDefs.slice(0, 8).map(f => f.name);
    const customFields = visibleFields.map((fname) => {
      const def = customFieldDefs.find(d => d.name === fname);
      let filled = 0;
      for (const o of opps) {
        const cf = o.custom_fields || {};
        const val =
          (def && (cf[def.ghl_id] || cf[def.field_key || ""] || cf[def.name])) ||
          cf[fname];
        if (val != null && String(val).trim() !== "") filled++;
      }
      const filledPercentage = safeRate(filled, totalLeads);
      return {
        name: fname,
        filledPercentage,
        emptyPercentage: 100 - filledPercentage,
        totalLeads,
        filledCount: filled,
      };
    });
    const overallFillRate = customFields.length === 0
      ? 0
      : customFields.reduce((a, b) => a + b.filledPercentage, 0) / customFields.length;

    // ===== Tempo médio por etapa (proxy) =====
    // Sem histórico, usamos média de (now - last_status_change_at) por bucket atual
    const now = Date.now();
    const sumHours = { contato_inicial: 0, proposta_enviada: 0, fechamento: 0 };
    const counters = { contato_inicial: 0, proposta_enviada: 0, fechamento: 0 };
    for (const o of opps) {
      const b = stageBucket(o.stage_id);
      if (b === "venda_ganha" || !b) continue;
      const ts = o.last_status_change_at || o.ghl_created_at;
      if (!ts) continue;
      const hrs = Math.max(0, Math.round((now - new Date(ts).getTime()) / (3600 * 1000)));
      (sumHours as any)[b] += hrs;
      (counters as any)[b]++;
    }
    const averageTimePerStage = {
      contatoInicial: counters.contato_inicial ? Math.round(sumHours.contato_inicial / counters.contato_inicial) : 0,
      propostaEnviada: counters.proposta_enviada ? Math.round(sumHours.proposta_enviada / counters.proposta_enviada) : 0,
      fechamento: counters.fechamento ? Math.round(sumHours.fechamento / counters.fechamento) : 0,
    };

    // ===== Daily leads (últimos 7 dias da janela ou hoje) =====
    const endRef = endDate ? new Date(endDate) : new Date();
    const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const dailyLeads: Array<{ date: string; count: number; dayName: string }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(endRef.getTime() - i * DAY_MS);
      const iso = d.toISOString().slice(0, 10);
      const count = opps.filter(o => o.ghl_created_at && (o.ghl_created_at as string).slice(0, 10) === iso).length;
      dailyLeads.push({ date: iso, count, dayName: dayLabels[d.getUTCDay()] });
    }

    // ===== Loss reasons =====
    const lossMap = new Map<string, number>();
    for (const o of lostOpps) {
      const r = o.lost_reason_id ? lossReasonsList.find(l => l.ghl_id === o.lost_reason_id)?.name : null;
      const key = r || "Não informado";
      lossMap.set(key, (lossMap.get(key) || 0) + 1);
    }
    const lossReasons = Array.from(lossMap.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    // ===== Listas auxiliares =====
    const pipelines = allPipelines.map(p => ({ id: p.ghl_id, name: p.name }));
    const usersOut = usersList.map(u => ({ id: u.ghl_id, name: u.name }));
    const origins = Array.from(originsCount.keys()).sort();

    const totalMonetary = opps.reduce((a, o) => a + (Number(o.monetary_value) || 0), 0);
    const wonMonetary = wonOpps.reduce((a, o) => a + (Number(o.monetary_value) || 0), 0);

    return new Response(JSON.stringify({
      totalLeads,
      lostLeads,
      lostLeadsDetail: lostOpps.slice(0, 200).map((o, i) => ({ id: i, name: o.name || `Opp ${o.ghl_id.slice(0, 6)}` })),
      funnelStages,
      conversionRates,
      sellers,
      leadOrigins: origemDistribution,
      origemDistribution,
      origemFillRate,
      wonOrigemDistribution,
      wonOrigemFillRate,
      customFields,
      averageTimePerStage,
      dailyLeads,
      pipelines,
      users: usersOut,
      origins,
      overallFillRate,
      lossReasons,
      // métricas extra (GHL)
      totalMonetary,
      wonMonetary,
      additionalDateFieldId,
      additionalDateFieldName,
      cachedAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("ghl-dashboard error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
