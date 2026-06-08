// Metricas do Analista IA — analise AO VIVO por periodo (sem snapshot).
//
// Decisao (07-08/06): largamos a "foto". A comparacao entre periodos e feita
// consultando ghl_opportunities filtrando por data, na hora. Cada funil e
// analisado SEPARADAMENTE (conversao/gargalo proprios) e ha tambem um rollup
// COMBINADO (apenas volume/valor — nunca conversao misturada).
//
// Dois tipos de numero:
//   - FLUXO (no periodo): leads criados, ganhos, perdidos, valor ganho. Keyados
//     por data (ghl_created_at / last_status_change_at), reconstruiveis a qualquer
//     momento.
//   - ESTOQUE (agora): abertos por etapa + envelhecimento (dias desde o ultimo
//     movimento). E o estado atual; o GHL nao guarda estado passado, entao isso
//     e sempre "agora" (aproxima o que a foto daria, via last_status_change_at).

export type BucketKey = "contato_inicial" | "proposta_enviada" | "fechamento" | "venda_ganha";
export type FunnelMapping = Record<BucketKey, string[]>;

const VALID_BUCKETS: BucketKey[] = ["contato_inicial", "proposta_enviada", "fechamento", "venda_ganha"];
const STUCK_DAYS = 14; // aberto sem se mexer ha mais de N dias = "parado"

export function inferFunnelMapping(stages: Array<{ id: string; name: string }>): FunnelMapping {
  const out: FunnelMapping = { contato_inicial: [], proposta_enviada: [], fechamento: [], venda_ganha: [] };
  for (const s of stages) {
    const n = (s.name || "").toLowerCase();
    if (/(ganho|ganha|won|venda)/.test(n)) out.venda_ganha.push(s.id);
    else if (/(fechamento|closing|negocia)/.test(n)) out.fechamento.push(s.id);
    else if (/(proposta|proposal|enviada|sent)/.test(n)) out.proposta_enviada.push(s.id);
    else out.contato_inicial.push(s.id);
  }
  if (!out.contato_inicial.length && stages[0]) out.contato_inicial.push(stages[0].id);
  return out;
}

function resolveStageMap(
  activeStages: Array<{ id: string; name: string }>,
  rawMapping: Record<string, any>,
): { stageMap: FunnelMapping; bucketOf: (stageId: string) => BucketKey | null } {
  const inferred = inferFunnelMapping(activeStages);
  const stageMap: FunnelMapping = { contato_inicial: [], proposta_enviada: [], fechamento: [], venda_ganha: [] };
  let hasUserMapping = false;
  for (const b of VALID_BUCKETS) {
    const v = rawMapping[b];
    if (Array.isArray(v) && v.length) { stageMap[b] = v.filter((x) => typeof x === "string"); hasUserMapping = true; }
  }
  if (!hasUserMapping) {
    for (const [stageId, bucket] of Object.entries(rawMapping)) {
      if (typeof bucket === "string" && (VALID_BUCKETS as string[]).includes(bucket)) {
        stageMap[bucket as BucketKey].push(stageId); hasUserMapping = true;
      }
    }
  }
  for (const b of VALID_BUCKETS) if (!stageMap[b].length) stageMap[b] = inferred[b];
  const idToBucket = new Map<string, BucketKey>();
  for (const b of VALID_BUCKETS) for (const id of stageMap[b]) idToBucket.set(id, b);
  return { stageMap, bucketOf: (id) => idToBucket.get(id) ?? null };
}

export interface PeriodFlow { leads_created: number; deals_won: number; deals_lost: number; value_won: number }
export interface SellerFlow { id: string; name: string; leads_created: number; deals_won: number; value_won: number }
export interface PipelinePeriodMetrics {
  id: string;
  name: string;
  period: PeriodFlow;
  win_rate: number | null;            // ganhos / (ganhos+perdidos) fechados no periodo
  current: {
    open: number;
    open_value: number;
    funnel: Record<BucketKey, number>; // estoque atual por etapa
    avg_open_age_days: number;         // envelhecimento medio dos abertos
    stuck_open: number;                // abertos parados ha > STUCK_DAYS
  };
  by_seller: SellerFlow[];
}
export interface PeriodMetrics {
  start: string;
  end: string;
  pipelines: PipelinePeriodMetrics[];
  combined: {                          // rollup dos funis marcados — VOLUME/VALOR, sem conversao
    period: PeriodFlow;
    current: { open: number; open_value: number };
    by_seller: SellerFlow[];
  };
  suggestions: { pending: number; approved: number; rejected: number; by_type: Record<string, number> };
}

function inWindow(ts: any, startMs: number, endMs: number): boolean {
  if (!ts) return false;
  const t = new Date(ts).getTime();
  return !Number.isNaN(t) && t >= startMs && t <= endMs;
}

// Computa metricas de fluxo (no periodo) + estoque (agora) para os funis dados.
// pipelineIds: lista de ghl_pipeline_id a analisar (vazio => nenhum).
export async function computePeriodMetrics(
  supabase: any,
  workspaceId: string,
  opts: { startISO: string; endISO: string; pipelineIds: string[] },
): Promise<PeriodMetrics> {
  const startMs = new Date(opts.startISO).getTime();
  const endMs = new Date(opts.endISO).getTime();
  const nowMs = Date.now();
  const selected = new Set(opts.pipelineIds);

  const [{ data: pipelinesRows }, { data: usersRows }, { data: settingsRow }] = await Promise.all([
    supabase.from("ghl_pipelines").select("ghl_id,name,stages").eq("workspace_id", workspaceId),
    supabase.from("ghl_users").select("ghl_id,name").eq("workspace_id", workspaceId),
    supabase.from("ghl_dashboard_settings").select("funnel_stage_mapping,won_stage_keys").eq("workspace_id", workspaceId).maybeSingle(),
  ]);

  const allPipelines = (pipelinesRows || []) as Array<{ ghl_id: string; name: string; stages: any }>;
  const usersList = (usersRows || []) as Array<{ ghl_id: string; name: string }>;
  const settings = (settingsRow || null) as any;
  const userName = new Map(usersList.map((u) => [u.ghl_id, u.name]));
  const pipelineName = new Map(allPipelines.map((p) => [p.ghl_id, p.name]));

  // Stage->bucket global (mapeamento e por stageId, vale entre funis)
  const activeStages = allPipelines.flatMap((p) => (Array.isArray(p.stages) ? p.stages : []) as Array<{ id: string; name: string }>);
  const { stageMap, bucketOf } = resolveStageMap(activeStages, (settings?.funnel_stage_mapping || {}) as Record<string, any>);
  const rawWonKeys: string[] = Array.isArray(settings?.won_stage_keys) ? settings.won_stage_keys : [];
  const wonStageIds = new Set<string>(stageMap.venda_ganha);
  for (const k of rawWonKeys) {
    if ((VALID_BUCKETS as string[]).includes(k)) for (const sid of stageMap[k as BucketKey]) wonStageIds.add(sid);
    else if (typeof k === "string") wonStageIds.add(k);
  }

  // Acumuladores por funil
  type Acc = {
    period: PeriodFlow;
    open: number; open_value: number; funnel: Record<BucketKey, number>;
    ageSum: number; ageCount: number; stuck: number;
    sellers: Map<string, SellerFlow>;
  };
  const newAcc = (): Acc => ({
    period: { leads_created: 0, deals_won: 0, deals_lost: 0, value_won: 0 },
    open: 0, open_value: 0, funnel: { contato_inicial: 0, proposta_enviada: 0, fechamento: 0, venda_ganha: 0 },
    ageSum: 0, ageCount: 0, stuck: 0, sellers: new Map(),
  });
  const accs = new Map<string, Acc>();
  for (const id of selected) accs.set(id, newAcc());

  const sellerOf = (acc: Acc, sid: string): SellerFlow => {
    let s = acc.sellers.get(sid);
    if (!s) { s = { id: sid, name: userName.get(sid) || (sid === "unassigned" ? "Sem responsável" : sid), leads_created: 0, deals_won: 0, value_won: 0 }; acc.sellers.set(sid, s); }
    return s;
  };

  // Carrega oportunidades dos funis selecionados (paginado)
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("ghl_opportunities")
      .select("pipeline_id,stage_id,status,monetary_value,assigned_to,ghl_created_at,last_status_change_at")
      .eq("workspace_id", workspaceId)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data || []) as Array<any>;
    for (const o of rows) {
      const pid = o.pipeline_id;
      if (!selected.has(pid)) continue;
      const acc = accs.get(pid)!;
      const value = Number(o.monetary_value || 0);
      const status = String(o.status || "").toLowerCase();
      const isWon = status === "won" || wonStageIds.has(o.stage_id);
      const isLost = status === "lost" || status === "abandoned";
      const sid = o.assigned_to || "unassigned";

      // FLUXO no periodo
      if (inWindow(o.ghl_created_at, startMs, endMs)) {
        acc.period.leads_created++;
        sellerOf(acc, sid).leads_created++;
      }
      if (isWon && inWindow(o.last_status_change_at, startMs, endMs)) {
        acc.period.deals_won++; acc.period.value_won += value;
        const s = sellerOf(acc, sid); s.deals_won++; s.value_won += value;
      }
      if (isLost && inWindow(o.last_status_change_at, startMs, endMs)) {
        acc.period.deals_lost++;
      }

      // ESTOQUE agora (abertos)
      if (!isWon && !isLost) {
        acc.open++; acc.open_value += value;
        const bucket = bucketOf(o.stage_id);
        if (bucket) acc.funnel[bucket]++;
        const ref = o.last_status_change_at || o.ghl_created_at;
        if (ref) {
          const ageDays = (nowMs - new Date(ref).getTime()) / 86400000;
          if (ageDays >= 0) { acc.ageSum += ageDays; acc.ageCount++; if (ageDays > STUCK_DAYS) acc.stuck++; }
        }
      }
    }
    if (rows.length < PAGE) break;
  }

  const pipelines: PipelinePeriodMetrics[] = Array.from(accs.entries())
    .map(([id, a]) => {
      const closed = a.period.deals_won + a.period.deals_lost;
      return {
        id,
        name: pipelineName.get(id) || "Funil sem nome",
        period: a.period,
        win_rate: closed > 0 ? Number((a.period.deals_won / closed).toFixed(4)) : null,
        current: {
          open: a.open,
          open_value: a.open_value,
          funnel: a.funnel,
          avg_open_age_days: a.ageCount > 0 ? Number((a.ageSum / a.ageCount).toFixed(1)) : 0,
          stuck_open: a.stuck,
        },
        by_seller: Array.from(a.sellers.values()).sort((x, y) => y.deals_won - x.deals_won),
      };
    })
    .sort((x, y) => y.period.leads_created - x.period.leads_created);

  // Combinado: soma de volume/valor (sem conversao)
  const cPeriod: PeriodFlow = { leads_created: 0, deals_won: 0, deals_lost: 0, value_won: 0 };
  let cOpen = 0, cOpenValue = 0;
  const cSellers = new Map<string, SellerFlow>();
  for (const p of pipelines) {
    cPeriod.leads_created += p.period.leads_created;
    cPeriod.deals_won += p.period.deals_won;
    cPeriod.deals_lost += p.period.deals_lost;
    cPeriod.value_won += p.period.value_won;
    cOpen += p.current.open; cOpenValue += p.current.open_value;
    for (const s of p.by_seller) {
      let cs = cSellers.get(s.id);
      if (!cs) { cs = { id: s.id, name: s.name, leads_created: 0, deals_won: 0, value_won: 0 }; cSellers.set(s.id, cs); }
      cs.leads_created += s.leads_created; cs.deals_won += s.deals_won; cs.value_won += s.value_won;
    }
  }

  // Sugestoes (estado atual do workspace)
  const sugg = { pending: 0, approved: 0, rejected: 0, by_type: {} as Record<string, number> };
  {
    const { data: sRows } = await supabase.from("suggestions").select("status,type").eq("workspace_id", workspaceId);
    for (const s of (sRows || []) as Array<{ status: string; type: string }>) {
      if (s.status === "pending") sugg.pending++;
      else if (s.status === "approved") sugg.approved++;
      else if (s.status === "rejected") sugg.rejected++;
      if (s.type) sugg.by_type[s.type] = (sugg.by_type[s.type] || 0) + 1;
    }
  }

  return {
    start: opts.startISO,
    end: opts.endISO,
    pipelines,
    combined: {
      period: cPeriod,
      current: { open: cOpen, open_value: cOpenValue },
      by_seller: Array.from(cSellers.values()).sort((x, y) => y.deals_won - x.deals_won),
    },
    suggestions: sugg,
  };
}
