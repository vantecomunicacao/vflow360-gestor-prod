// VFlowGHL — ghl-cooling-leads
// Calcula APENAS os "leads esfriando" (oportunidades abertas sem atividade há
// X dias), isolando os dados sensíveis do dashboard do gestor. Para vendedores
// (com vínculo em user_ghl_links) o escopo é FORÇADO ao ghl_user_id dele.
//
// O slug leva o prefixo `ghl-` porque o projeto Kommo compartilha este mesmo
// projeto Supabase e publica a função dele em `cooling-leads` (schema kommo).
//
// Atividade = o mais recente entre a última mudança de etapa
// (last_status_change_at, fallback ghl_created_at) e a última mensagem trocada
// (ghl_messages + o last_message_at que a própria conversa já traz do GHL).
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
    const requestedSellerIds: string[] = Array.isArray(payload.sellerIds)
      ? payload.sellerIds.filter((s: unknown): s is string => typeof s === "string" && s.length > 0)
      : [];

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

    // Vendedor com escopo forçado nunca amplia o filtro pelo payload; gestor
    // usa livremente os sellerIds que vieram da tela.
    const sellerIdFilter: string[] = forcedSellerId ? [forcedSellerId] : requestedSellerIds;

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
    // Pagina em blocos de 1000: o PostgREST corta cada request em max_rows=1000,
    // então um único .limit(10000) subcontava funis com +1000 opportunities.
    const OPP_PAGE = 1000;
    const openRows: any[] = [];
    for (let from = 0; ; from += OPP_PAGE) {
      let q = supabase
        .from("ghl_opportunities")
        .select("ghl_id,name,stage_id,status,assigned_to,ghl_created_at,last_status_change_at,contact_id,contact_phone")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null) // ignora fantasmas (excluídos no GHL, soft-deletados)
        .range(from, from + OPP_PAGE - 1);
      if (filterPipelineId) q = q.eq("pipeline_id", filterPipelineId);
      if (sellerIdFilter.length === 1) q = q.eq("assigned_to", sellerIdFilter[0]);
      else if (sellerIdFilter.length > 1) q = q.in("assigned_to", sellerIdFilter);
      const { data: pageRows, error: oppErr } = await q;
      if (oppErr) throw oppErr;
      const rows = (pageRows || []) as any[];
      openRows.push(...rows);
      if (rows.length < OPP_PAGE) break;
      if (from > 200_000) break; // safety anti-runaway
    }

    const nowMs = Date.now();
    const isOpen = (o: any) => {
      const st = (o.status || "").toLowerCase();
      if (st === "lost" || st === "won") return false;
      if (o.stage_id && wonStageIds.has(o.stage_id)) return false;
      return true;
    };

    // Candidatos: abertas paradas (por etapa/criação) há >= warning dias.
    type Candidate = {
      contactId: string | null; phone: string; phoneRaw: string | null;
      baseMs: number; name: string; seller: string | null;
    };
    const candidates: Candidate[] = [];
    for (const o of (openRows || [])) {
      if (!isOpen(o)) continue;
      const baseStr = o.last_status_change_at || o.ghl_created_at;
      if (!baseStr) continue;
      const baseMs = new Date(baseStr).getTime();
      if (isNaN(baseMs)) continue;
      if ((nowMs - baseMs) / DAY < COOLING_THRESHOLDS.warning) continue;
      candidates.push({
        contactId: o.contact_id || null,
        phone: normalizePhone(o.contact_phone),
        phoneRaw: o.contact_phone || null,
        baseMs,
        name: o.name || `Oportunidade ${String(o.ghl_id).slice(0, 6)}`,
        seller: o.assigned_to ? (sellerNameById.get(o.assigned_to) || null) : null,
      });
    }

    // Última atividade de conversa dos candidatos. As conversas são buscadas por
    // chave exata em lotes (contact_id e telefone como está gravado) — varrer
    // todas as conversas do workspace estourava o tempo em contas grandes.
    // Guardamos por contato E por telefone porque nem toda oportunidade tem
    // contact_id; na hora de pontuar vale o mais recente entre os dois.
    const lastActByContact = new Map<string, number>();
    const lastActByPhone = new Map<string, number>();
    const bump = (map: Map<string, number>, key: string | null | undefined, t: number) => {
      if (!key || isNaN(t)) return;
      if (t > (map.get(key) || 0)) map.set(key, t);
    };

    const contactIds = [...new Set(candidates.map((c) => c.contactId).filter(Boolean))] as string[];
    const rawPhones = [...new Set(candidates.map((c) => c.phoneRaw).filter(Boolean))] as string[];
    const convMeta = new Map<string, { contactId: string | null; phone: string }>();
    const PAGE = 1000;
    const IN_CHUNK = 300;

    const collectConvs = async (column: "ghl_contact_id" | "contact_phone", values: string[]) => {
      for (let i = 0; i < values.length; i += IN_CHUNK) {
        const chunk = values.slice(i, i + IN_CHUNK);
        for (let from = 0; ; from += PAGE) {
          const { data: convsRows, error: convErr } = await supabase
            .from("ghl_conversations")
            .select("ghl_conversation_id,ghl_contact_id,contact_phone,last_message_at")
            .eq("workspace_id", workspaceId)
            .in(column, chunk)
            .range(from, from + PAGE - 1);
          if (convErr) { console.error("[cooling] ghl_conversations error", convErr); return; }
          const rows = (convsRows || []) as any[];
          for (const c of rows) {
            convMeta.set(c.ghl_conversation_id, {
              contactId: c.ghl_contact_id || null,
              phone: normalizePhone(c.contact_phone),
            });
            // A conversa já traz a data da última mensagem vinda do GHL; usar
            // isso cobre o período em que o sync de mensagens ainda não chegou.
            if (c.last_message_at) {
              const t = new Date(c.last_message_at).getTime();
              bump(lastActByContact, c.ghl_contact_id, t);
              bump(lastActByPhone, normalizePhone(c.contact_phone), t);
            }
          }
          if (rows.length < PAGE) break;
          if (from > 50_000) break; // safety
        }
      }
    };

    // Todo o sinal de conversa é best-effort: se algo aqui falhar, as faixas
    // ainda saem pela data de etapa/criação (como no card do dashboard, que
    // degrada em vez de derrubar a tela inteira).
    try {
      if (contactIds.length > 0) await collectConvs("ghl_contact_id", contactIds);
      if (rawPhones.length > 0) await collectConvs("contact_phone", rawPhones);

      // Mensagens das conversas encontradas (janela de 90 dias).
      const coolConvIds = [...convMeta.keys()];
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
              const meta = convMeta.get(m.ghl_conversation_id);
              if (!meta) continue;
              const t = new Date(m.date_added).getTime();
              bump(lastActByContact, meta.contactId, t);
              bump(lastActByPhone, meta.phone, t);
            }
            if (rows.length < MSG_PAGE) break;
            mFrom += MSG_PAGE;
            if (mFrom > 100000) break; // safety
          }
        }
      }
    } catch (e) {
      console.error("[cooling] sinal de conversa indisponível, seguindo só com data de etapa", e);
    }

    type CoolingLead = { name: string; seller: string | null; days: number };
    const result = {
      warning: 0, alert: 0, critical: 0, total: 0,
      thresholds: COOLING_THRESHOLDS,
      leads: { warning: [] as CoolingLead[], alert: [] as CoolingLead[], critical: [] as CoolingLead[] },
      scope: forcedSellerId ? "seller" : "workspace",
    };

    for (const c of candidates) {
      const effMs = Math.max(
        c.baseMs,
        c.contactId ? (lastActByContact.get(c.contactId) || 0) : 0,
        c.phone ? (lastActByPhone.get(c.phone) || 0) : 0,
      );
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
    console.error("ghl-cooling-leads error:", msg);
    // Status por tipo de falha: a tela mostra a mensagem, então "Forbidden"
    // (usuário fora da conta) não pode chegar como um 500 genérico.
    const status = msg === "Missing authorization" || msg === "Unauthorized" ? 401
      : msg === "Forbidden" ? 403
      : msg === "workspace_id is required" ? 400
      : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
