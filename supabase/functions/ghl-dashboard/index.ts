// VFlowGHL — ghl-dashboard
// Agrega dados de ghl_opportunities + pipelines + users + custom_fields + loss_reasons
// aplicando filtros (período, pipeline, vendedor, origem) e devolve DashboardData.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { reportEdgeError } from "../_shared/error-reporter.ts";

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
const MIN_MS = 60_000;

// Calcula minutos "úteis" entre dois timestamps, considerando apenas o intervalo de expediente
// startMin/endMin em minutos desde 00:00 UTC-3 (Brasília). Se start > end, expediente vira a noite.
function businessMinutesBetween(fromMs: number, toMs: number, startMin: number, endMin: number): number {
  if (toMs <= fromMs) return 0;
  // 24h = expediente integral
  if (startMin === endMin) return Math.round((toMs - fromMs) / MIN_MS);

  // Trabalhar em fuso de Brasília (UTC-3) para alinhar com horário comercial local
  const TZ_OFFSET_MS = 3 * 60 * MIN_MS;
  const wraps = startMin > endMin; // expediente atravessa meia-noite

  const inBusiness = (ms: number): boolean => {
    const local = ms - TZ_OFFSET_MS;
    const dayMs = ((local % DAY_MS) + DAY_MS) % DAY_MS;
    const min = dayMs / MIN_MS;
    return wraps ? (min >= startMin || min < endMin) : (min >= startMin && min < endMin);
  };

  // Caminhar minuto a minuto seria pesado em diffs grandes. Subdividimos por blocos de 15 min
  // e ajustamos com varredura fina nos limites. Para diffs muito grandes (>30 dias), aproximamos.
  const totalMin = (toMs - fromMs) / MIN_MS;
  if (totalMin > 60 * 24 * 30) {
    // aproximação: razão de minutos úteis no dia
    const dailyBusinessMin = wraps ? (1440 - startMin + endMin) : (endMin - startMin);
    return Math.round(totalMin * (dailyBusinessMin / 1440));
  }

  let count = 0;
  // step de 1 min é exato; cap a 60*24*30 já evita explosão
  for (let t = fromMs; t < toMs; t += MIN_MS) {
    if (inBusiness(t)) count++;
  }
  return count;
}

function parseHHMM(s: string | null | undefined, fallbackMin: number): number {
  if (!s || typeof s !== "string") return fallbackMin;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallbackMin;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return h * 60 + mm;
}

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
    const filterStageId: string | null = payload.stageId || null;
    const filterUserId: string | null = payload.sellerId || null;
    const filterOrigin: string | null = payload.sourceOrigin || null;
    const filterUtmMedium: string | null = payload.utmMedium || null;
    const filterUtmCampaign: string | null = payload.utmCampaign || null;
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
    // UTM custom fields mapeados nas configurações (ghl_id, field_key ou name)
    const utmSourceFieldId: string | null = settings?.utm_source_field_id || null;
    const utmMediumFieldId: string | null = settings?.utm_medium_field_id || null;
    const utmCampaignFieldId: string | null = settings?.utm_campaign_field_id || null;
    const utmContentFieldId: string | null = settings?.utm_content_field_id || null;
    const utmTermFieldId: string | null = settings?.utm_term_field_id || null;

    // ===== Query opportunities com filtros =====
    let q = supabase
      .from("ghl_opportunities")
      .select("ghl_id,name,pipeline_id,stage_id,status,monetary_value,source,assigned_to,lost_reason_id,custom_fields,ghl_created_at,last_status_change_at,contact_phone")
      .eq("workspace_id", workspaceId)
      .limit(10000);
    if (filterPipelineId) q = q.eq("pipeline_id", filterPipelineId);
    if (filterStageId) q = q.eq("stage_id", filterStageId);
    if (filterUserId) q = q.eq("assigned_to", filterUserId);
    if (startDate) q = q.gte("ghl_created_at", startDate);
    if (endDate) q = q.lte("ghl_created_at", endDate);
    const { data: oppsRows, error: oppsErr } = await q;
    if (oppsErr) throw oppsErr;
    let opps = (oppsRows || []) as any[];

    // GHL custom_fields pode vir como:
    //   A) Array: [{id, type, fieldValue, fieldValueString, fieldValueArray, fieldValueNumber, ...}]
    //   B) Objeto: {ghl_id: value} ou {field_key: value} (legado)
    // Esta função extrai o valor "bruto" de um campo dado um set de chaves possíveis.
    const extractCfValue = (cf: any, keys: Array<string | null | undefined>): any => {
      if (!cf) return undefined;
      const validKeys = keys.filter((k): k is string => !!k && k.length > 0);
      if (validKeys.length === 0) return undefined;

      if (Array.isArray(cf)) {
        for (const item of cf) {
          if (!item || typeof item !== "object") continue;
          const itemId = item.id || item.fieldId || item.customFieldId || item.key;
          if (!validKeys.some(k => k === itemId || k === item.fieldKey || k === item.name)) continue;
          // tenta vários formatos de valor
          const v =
            item.fieldValueString ??
            item.fieldValueArray ??
            item.fieldValueNumber ??
            item.fieldValueDate ??
            item.fieldValue ??
            item.value;
          if (v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0) && String(v).trim() !== "") {
            return v;
          }
        }
        return undefined;
      }

      // formato objeto
      for (const k of validKeys) {
        const v = cf[k];
        if (v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0) && String(v).trim() !== "") {
          return v;
        }
      }
      return undefined;
    };

    const cfValueToString = (v: any): string | null => {
      if (v == null) return null;
      if (Array.isArray(v)) return v.length ? v.join(", ") : null;
      const s = String(v).trim();
      return s === "" ? null : s;
    };

    // Origem: source nativo ou custom field configurado
    const getOrigin = (o: any): string | null => {
      if (originFieldName) {
        const def = customFieldDefs.find(d =>
          d.name?.toLowerCase() === originFieldName.toLowerCase() ||
          d.field_key === originFieldName ||
          d.ghl_id === originFieldName
        );
        const keys = def
          ? [def.ghl_id, def.field_key, def.name, originFieldName]
          : [originFieldName];
        const v = extractCfValue(o.custom_fields, keys);
        const s = cfValueToString(v);
        if (s) return s;
      }
      return o.source || null;
    };

    // Lê o valor de um custom field UTM por id (aceita ghl_id, field_key ou name)
    const getUtm = (o: any, fieldId: string | null): string | null => {
      if (!fieldId) return null;
      const def = customFieldDefs.find(d =>
        d.ghl_id === fieldId || d.field_key === fieldId || d.name === fieldId
      );
      const keys = def ? [def.ghl_id, def.field_key, def.name, fieldId] : [fieldId];
      const v = extractCfValue(o.custom_fields, keys);
      return cfValueToString(v);
    };

    if (filterOrigin) {
      opps = opps.filter(o => getOrigin(o) === filterOrigin);
    }
    if (filterUtmMedium && utmMediumFieldId) {
      opps = opps.filter(o => getUtm(o, utmMediumFieldId) === filterUtmMedium);
    }
    if (filterUtmCampaign && utmCampaignFieldId) {
      opps = opps.filter(o => getUtm(o, utmCampaignFieldId) === filterUtmCampaign);
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
        const raw = extractCfValue(o.custom_fields, [
          additionalDateFieldId,
          additionalDateFieldDef?.field_key,
          additionalDateFieldDef?.name,
        ]);
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
    // Funil de passagem: cada etapa soma os leads que estão nela + os que avançaram
    const passage = {
      contato_inicial: counts.contato_inicial + counts.proposta_enviada + counts.fechamento + counts.venda_ganha,
      proposta_enviada: counts.proposta_enviada + counts.fechamento + counts.venda_ganha,
      fechamento: counts.fechamento + counts.venda_ganha,
      venda_ganha: counts.venda_ganha,
    };
    const funnelStages = [
      { id: "contato_inicial", name: "Contato Inicial", count: passage.contato_inicial, currentCount: counts.contato_inicial, leads: leadsByBucket.contato_inicial },
      { id: "proposta_enviada", name: "Proposta Enviada", count: passage.proposta_enviada, currentCount: counts.proposta_enviada, leads: leadsByBucket.proposta_enviada },
      { id: "fechamento", name: "Fechamento", count: passage.fechamento, currentCount: counts.fechamento, leads: leadsByBucket.fechamento },
      { id: "venda_ganha", name: "Venda Ganha", count: passage.venda_ganha, currentCount: counts.venda_ganha, leads: leadsByBucket.venda_ganha },
    ];

    const safeRate = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
    // Taxas baseadas no funil de passagem (passou para a próxima etapa)
    const conversionRates = {
      contatoToProsposta: safeRate(passage.proposta_enviada, passage.contato_inicial),
      propostaToFechamento: safeRate(passage.fechamento, passage.proposta_enviada),
      fechamentoToVenda: safeRate(passage.venda_ganha, passage.fechamento),
      overallConversion: safeRate(passage.venda_ganha, passage.contato_inicial || totalLeads),
    };

    // ===== Sellers =====
    const sellersMap = new Map<string, { id: string; name: string; contatoInicial: number; propostaEnviada: number; fechamento: number; vendaGanha: number; avgResponseMinutes: number | null; responseCount: number }>();
    for (const u of usersList) sellersMap.set(u.ghl_id, { id: u.ghl_id, name: u.name, contatoInicial: 0, propostaEnviada: 0, fechamento: 0, vendaGanha: 0, avgResponseMinutes: null, responseCount: 0 });
    // Mapa de phone -> assigned_to (para vincular conversas por telefone ao vendedor)
    const phoneToSeller = new Map<string, string>();
    for (const o of opps) {
      const b = stageBucket(o.stage_id);
      if (!b) continue;
      const userKey = o.assigned_to || "__unassigned__";
      let s = sellersMap.get(userKey);
      if (!s) {
        s = { id: userKey, name: userKey === "__unassigned__" ? "Não atribuído" : `Usuário ${userKey.slice(0, 6)}`, contatoInicial: 0, propostaEnviada: 0, fechamento: 0, vendaGanha: 0, avgResponseMinutes: null, responseCount: 0 };
        sellersMap.set(userKey, s);
      }
      if (b === "contato_inicial") s.contatoInicial++;
      if (b === "proposta_enviada") s.propostaEnviada++;
      if (b === "fechamento") s.fechamento++;
      if (b === "venda_ganha") s.vendaGanha++;
      const np = (o.contact_phone || "").replace(/\D+/g, "");
      if (np && o.assigned_to && !phoneToSeller.has(np)) phoneToSeller.set(np, o.assigned_to);
    }

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

    // ===== UTM distributions (source / medium / campaign) =====
    // Para cada dimensão UTM: distribuição (donut) + fill rate + lista de valores únicos (filtros).
    const buildUtmDistribution = (fieldId: string | null) => {
      if (!fieldId) return { distribution: [] as Array<{ name: string; count: number; percentage: number }>, fillRate: 0, values: [] as string[] };
      const counts = new Map<string, number>();
      let filled = 0;
      for (const o of opps) {
        const v = getUtm(o, fieldId);
        if (v) {
          filled++;
          counts.set(v, (counts.get(v) || 0) + 1);
        }
      }
      const distribution = Array.from(counts.entries())
        .map(([name, count]) => ({ name, count, percentage: safeRate(count, filled) }))
        .sort((a, b) => b.count - a.count);
      return {
        distribution,
        fillRate: safeRate(filled, totalLeads),
        values: distribution.map(d => d.name),
      };
    };

    const utmSource = buildUtmDistribution(utmSourceFieldId);
    const utmMedium = buildUtmDistribution(utmMediumFieldId);
    const utmCampaign = buildUtmDistribution(utmCampaignFieldId);

    // Won leads por UTM Source — pra card "Origem das vendas"
    const buildWonUtmSource = () => {
      if (!utmSourceFieldId) return { distribution: [] as Array<{ name: string; count: number; percentage: number }>, fillRate: 0 };
      const counts = new Map<string, number>();
      let filled = 0;
      for (const o of wonOpps) {
        const v = getUtm(o, utmSourceFieldId);
        if (v) {
          filled++;
          counts.set(v, (counts.get(v) || 0) + 1);
        }
      }
      const distribution = Array.from(counts.entries())
        .map(([name, count]) => ({ name, count, percentage: safeRate(count, filled) }))
        .sort((a, b) => b.count - a.count);
      return {
        distribution,
        fillRate: safeRate(filled, wonOpps.length),
      };
    };
    const wonUtmSource = buildWonUtmSource();

    // ===== Origem (UTM Source + Campaign) — leads e vendas =====
    // Combina source + campaign por opportunity. Percentages relativos ao TOTAL
    // (não só os preenchidos), para que o pie represente 100% das opps do período.
    // Opps sem UTM Source viram fatia "Não identificado". Desempate por contagem
    // desc, depois alfabético.
    const buildSourceCampaignDistribution = (oppsList: any[]) => {
      if (!utmSourceFieldId) {
        return { distribution: [] as Array<{ name: string; count: number; percentage: number }>, fillRate: 0 };
      }
      const counts = new Map<string, number>();
      let filled = 0;
      for (const o of oppsList) {
        const source = getUtm(o, utmSourceFieldId);
        if (!source) continue;
        const campaign = utmCampaignFieldId ? getUtm(o, utmCampaignFieldId) : null;
        const key = campaign ? `${source} · ${campaign}` : source;
        filled++;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const total = oppsList.length;
      const distribution = Array.from(counts.entries())
        .map(([name, count]) => ({ name, count, percentage: safeRate(count, total) }))
        .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));
      const unidentified = total - filled;
      if (unidentified > 0) {
        distribution.push({
          name: "Não identificado",
          count: unidentified,
          percentage: safeRate(unidentified, total),
        });
      }
      return {
        distribution,
        fillRate: safeRate(filled, total),
      };
    };
    const leadsOrigin = buildSourceCampaignDistribution(opps);
    const wonOrigin = buildSourceCampaignDistribution(wonOpps);

    // ===== Custom fields fill rate =====
    // visible_custom_fields pode conter ghl_id, field_key ou name (legado)
    // visible_custom_fields pode conter ghl_id, field_key ou name (legado)
    // Filtra apenas campos do modelo "opportunity" — campos de contato não são salvos em ghl_opportunities.custom_fields
    const isOpportunityField = (key: string) => {
      const def = customFieldDefs.find(d => d.ghl_id === key)
        || customFieldDefs.find(d => d.field_key === key)
        || customFieldDefs.find(d => d.name === key);
      if (!def) return false;
      return (def.model || "").toLowerCase() === "opportunity";
    };
    const rawVisibleFieldKeys: string[] = settings?.visible_custom_fields?.length
      ? settings.visible_custom_fields
      : customFieldDefs.filter(f => (f.model || "").toLowerCase() === "opportunity").slice(0, 8).map(f => f.ghl_id);
    const visibleFieldKeys = rawVisibleFieldKeys.filter(isOpportunityField);
    const customFields = visibleFieldKeys.map((key) => {
      const def = customFieldDefs.find(d => d.ghl_id === key)
        || customFieldDefs.find(d => d.field_key === key)
        || customFieldDefs.find(d => d.name === key);
      const displayName = def?.name || key;
      let filled = 0;
      for (const o of opps) {
        const val = extractCfValue(o.custom_fields, [
          def?.ghl_id,
          def?.field_key,
          def?.name,
          key,
        ]);
        if (cfValueToString(val) !== null) filled++;
      }
      const filledPercentage = safeRate(filled, totalLeads);
      return {
        name: displayName,
        filledPercentage,
        emptyPercentage: 100 - filledPercentage,
        totalLeads,
        filledCount: filled,
      };
    });
    const overallFillRate = customFields.length === 0
      ? 0
      : customFields.reduce((a, b) => a + b.filledPercentage, 0) / customFields.length;

    // ===== Custom field distributions (mini pie charts) =====
    const rawChartFieldKeys: string[] = Array.isArray(settings?.chart_custom_fields) ? settings.chart_custom_fields : [];
    const chartFieldKeys = rawChartFieldKeys.filter(isOpportunityField);
    const customFieldDistributions = chartFieldKeys.map((key) => {
      const def = customFieldDefs.find(d => d.ghl_id === key)
        || customFieldDefs.find(d => d.field_key === key)
        || customFieldDefs.find(d => d.name === key);
      const displayName = def?.name || key;
      const counts = new Map<string, number>();
      let filled = 0;
      for (const o of opps) {
        const val = extractCfValue(o.custom_fields, [def?.ghl_id, def?.field_key, def?.name, key]);
        const s = cfValueToString(val);
        if (s === null) continue;
        filled++;
        // Se o valor é array (multi-select), conta cada item
        const items = Array.isArray(val) ? val.map((x) => String(x).trim()).filter(Boolean) : [s];
        for (const item of items) {
          counts.set(item, (counts.get(item) || 0) + 1);
        }
      }
      const distribution = Array.from(counts.entries())
        .map(([name, count]) => ({ name, count, percentage: safeRate(count, filled) }))
        .sort((a, b) => b.count - a.count);
      return {
        key,
        name: displayName,
        totalLeads,
        filledCount: filled,
        distribution,
      };
    });

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

    // ===== Ciclos do funil (tempo de criação → desfecho) =====
    // Média de dias entre ghl_created_at e last_status_change_at para opps ganhas/perdidas.
    // Ignora opps sem last_status_change_at preenchido (sem histórico de mudança).
    const cycleDays = (subset: any[]): { days: number; sampleSize: number } => {
      let total = 0;
      let n = 0;
      for (const o of subset) {
        if (!o.ghl_created_at || !o.last_status_change_at) continue;
        const ms = new Date(o.last_status_change_at).getTime() - new Date(o.ghl_created_at).getTime();
        if (ms < 0) continue;
        total += ms;
        n++;
      }
      if (n === 0) return { days: 0, sampleSize: 0 };
      const avgMs = total / n;
      const days = avgMs / DAY_MS;
      return { days: Math.round(days * 10) / 10, sampleSize: n };
    };
    const cycleToWon = cycleDays(wonOpps);
    const cycleToLost = cycleDays(lostOpps);

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
    const pipelines = allPipelines.map(p => ({ id: p.ghl_id, name: p.name, stages: Array.isArray(p.stages) ? p.stages : [] }));
    const usersOut = usersList.map(u => ({ id: u.ghl_id, name: u.name }));
    const origins = Array.from(originsCount.keys()).sort();

    const totalMonetary = opps.reduce((a, o) => a + (Number(o.monetary_value) || 0), 0);
    const wonMonetary = wonOpps.reduce((a, o) => a + (Number(o.monetary_value) || 0), 0);
    const negotiatingMonetary = opps.reduce((a, o) => {
      if ((o.status || "").toLowerCase() === "lost") return a;
      const b = stageBucket(o.stage_id);
      return (b === "proposta_enviada" || b === "fechamento") ? a + (Number(o.monetary_value) || 0) : a;
    }, 0);

    // ===== Tempo médio de resposta do vendedor =====
    // Considera APENAS conversas de leads das oportunidades filtradas pelo header.
    // Fallback: se nenhum pipeline foi selecionado, restringe a oportunidades
    // cujo stage_id esteja em algum bucket mapeado do funil (ou em won_stage_keys).
    const businessStartStr: string = settings?.business_hours_start || "09:00";
    const businessEndStr: string = settings?.business_hours_end || "18:00";
    const startMin = parseHHMM(businessStartStr, 9 * 60);
    const endMin = parseHHMM(businessEndStr, 18 * 60);

    // Conjunto de stage_ids "comerciais" (todos os buckets + won)
    const mappedStageIds = new Set<string>([
      ...stageMap.contato_inicial,
      ...stageMap.proposta_enviada,
      ...stageMap.fechamento,
      ...stageMap.venda_ganha,
      ...wonStageIds,
    ]);

    // Base de oportunidades para o cálculo
    let oppsForResponse = opps;
    if (!filterPipelineId && mappedStageIds.size > 0) {
      oppsForResponse = opps.filter((o) => o.stage_id && mappedStageIds.has(o.stage_id));
    }

    // Normaliza telefones (mantém apenas dígitos) para casar com conversations
    const normalizePhone = (p: string | null | undefined) => (p || "").replace(/\D+/g, "");
    const phoneSet = new Set<string>();
    for (const o of oppsForResponse) {
      const np = normalizePhone(o.contact_phone);
      if (np) phoneSet.add(np);
    }

    // Pagina TODAS as conversas do workspace e filtra por phone match (sem filtro de data
    // — conversas antigas podem ter respostas dentro do período).
    // Quando há filtro de vendedor, também inclui conversas vinculadas à instância de WhatsApp
    // daquele vendedor (conversations.ghl_user_id), mesmo sem oportunidade casada por telefone.
    const convIds: string[] = [];
    const seenConvIds = new Set<string>();
    const convToSeller = new Map<string, string>(); // convId -> sellerId
    if (phoneSet.size > 0 || filterUserId) {
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data: convsRows, error: convErr } = await supabase
          .from("conversations")
          .select("id,contact_phone,ghl_user_id")
          .eq("workspace_id", workspaceId)
          .range(from, from + PAGE - 1);
        if (convErr) { console.error("convs page error", convErr); break; }
        const rows = convsRows || [];
        for (const c of rows) {
          const id = (c as any).id as string;
          if (seenConvIds.has(id)) continue;
          const phone = normalizePhone((c as any).contact_phone);
          const convSeller = (c as any).ghl_user_id as string | null;
          const phoneMatch = phoneSet.has(phone);
          const sellerMatch = !!filterUserId && convSeller === filterUserId;
          if (phoneMatch || sellerMatch) {
            convIds.push(id);
            seenConvIds.add(id);
            // prefer explicit conversation linkage, fall back to phone -> assigned_to
            const sid = convSeller || phoneToSeller.get(phone) || null;
            if (sid) convToSeller.set(id, sid);
          }
        }
        if (rows.length < PAGE) break;
        from += PAGE;
        if (from > 50000) break; // hard safety
      }
    }

    let totalResponseMinutes = 0;
    let responseCount = 0;
    let conversationsWithResponse = 0;
    let conversationsWithInbound = 0;
    // Por vendedor
    const sellerResponse = new Map<string, { totalMinutes: number; count: number }>();

    if (convIds.length > 0) {
      // Pagina mensagens em lotes de conversation IDs e por páginas, sem cortar dados.
      const ID_CHUNK = 200;
      const MSG_PAGE = 1000;
      const msgsAll: Array<{ conversation_id: string; direction: string; created_at: string }> = [];
      const startIso = startDate || new Date(0).toISOString();
      const endIso = endDate || new Date().toISOString();

      for (let i = 0; i < convIds.length; i += ID_CHUNK) {
        const chunk = convIds.slice(i, i + ID_CHUNK);
        let mFrom = 0;
        while (true) {
          const { data: msgsRows, error: msgErr } = await supabase
            .from("messages")
            .select("conversation_id,direction,created_at")
            .in("conversation_id", chunk)
            .gte("created_at", startIso)
            .lte("created_at", endIso)
            .order("created_at", { ascending: true })
            .range(mFrom, mFrom + MSG_PAGE - 1);
          if (msgErr) { console.error("msgs page error", msgErr); break; }
          const rows = (msgsRows || []) as any[];
          for (const m of rows) msgsAll.push(m);
          if (rows.length < MSG_PAGE) break;
          mFrom += MSG_PAGE;
          if (mFrom > 100000) break; // safety
        }
      }

      const msgsRows = msgsAll;
      console.log(`[response-time] convIds=${convIds.length} messages=${msgsRows.length}`);

      const byConv = new Map<string, Array<{ dir: string; t: number }>>();
      for (const m of (msgsRows || [])) {
        const arr = byConv.get((m as any).conversation_id) || [];
        arr.push({ dir: (m as any).direction, t: new Date((m as any).created_at).getTime() });
        byConv.set((m as any).conversation_id, arr);
      }

      for (const [convId, msgs] of byConv) {
        let lastInbound: number | null = null;
        let convHadResponse = false;
        let convHadInbound = false;
        const sid = convToSeller.get(convId);
        const acc = sid ? (sellerResponse.get(sid) || { totalMinutes: 0, count: 0 }) : null;
        for (const m of msgs) {
          if (m.dir === "inbound") {
            if (!convHadInbound) {
              convHadInbound = true;
              conversationsWithInbound++;
            }
            if (lastInbound === null) lastInbound = m.t;
          } else if (m.dir === "outbound" && lastInbound !== null) {
            const minutes = businessMinutesBetween(lastInbound, m.t, startMin, endMin);
            if (minutes > 0) {
              totalResponseMinutes += minutes;
              responseCount++;
              convHadResponse = true;
              if (acc) { acc.totalMinutes += minutes; acc.count++; }
            } else if (m.t - lastInbound > 0) {
              totalResponseMinutes += 0;
              responseCount++;
              convHadResponse = true;
              if (acc) { acc.count++; }
            }
            lastInbound = null;
          }
        }
        if (convHadResponse) conversationsWithResponse++;
        if (sid && acc) sellerResponse.set(sid, acc);
      }
    }

    // Aplica tempo médio de resposta a cada vendedor
    for (const [sid, agg] of sellerResponse) {
      const s = sellersMap.get(sid);
      if (s) {
        s.avgResponseMinutes = agg.count > 0 ? agg.totalMinutes / agg.count : null;
        s.responseCount = agg.count;
      }
    }

    const sellers = Array.from(sellersMap.values()).filter(s => s.contatoInicial + s.propostaEnviada + s.fechamento + s.vendaGanha > 0);

    const responseTime = {
      averageMinutes: responseCount > 0 ? totalResponseMinutes / responseCount : 0,
      responseCount,
      conversationsAnalyzed: conversationsWithResponse,
      conversationsWithInbound,
      businessHoursStart: businessStartStr,
      businessHoursEnd: businessEndStr,
    };



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
      utmSourceDistribution: utmSource.distribution,
      utmSourceFillRate: utmSource.fillRate,
      utmSourceValues: utmSource.values,
      utmMediumDistribution: utmMedium.distribution,
      utmMediumFillRate: utmMedium.fillRate,
      utmMediumValues: utmMedium.values,
      utmCampaignDistribution: utmCampaign.distribution,
      utmCampaignFillRate: utmCampaign.fillRate,
      utmCampaignValues: utmCampaign.values,
      wonUtmSourceDistribution: wonUtmSource.distribution,
      wonUtmSourceFillRate: wonUtmSource.fillRate,
      leadsOriginDistribution: leadsOrigin.distribution,
      leadsOriginFillRate: leadsOrigin.fillRate,
      wonOriginDistribution: wonOrigin.distribution,
      wonOriginFillRate: wonOrigin.fillRate,
      utmConfigured: {
        source: !!utmSourceFieldId,
        medium: !!utmMediumFieldId,
        campaign: !!utmCampaignFieldId,
        content: !!utmContentFieldId,
        term: !!utmTermFieldId,
      },
      customFields,
      customFieldDistributions,
      averageTimePerStage,
      cycleToWonDays: cycleToWon.days,
      cycleToWonSample: cycleToWon.sampleSize,
      cycleToLostDays: cycleToLost.days,
      cycleToLostSample: cycleToLost.sampleSize,
      dailyLeads,
      pipelines,
      users: usersOut,
      origins,
      overallFillRate,
      lossReasons,
      // métricas extra (GHL)
      totalMonetary,
      wonMonetary,
      negotiatingMonetary,
      additionalDateFieldId,
      additionalDateFieldName,
      responseTime,
      cachedAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("ghl-dashboard error:", msg);
    await reportEdgeError("edge:ghl-dashboard", err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
