export const FUNNEL_BUCKETS = [
  { key: "contato_inicial", label: "Contato Inicial" },
  { key: "qualificando", label: "Qualificando" },
  { key: "proposta_enviada", label: "Proposta Enviada" },
  { key: "fechamento", label: "Fechamento" },
  { key: "venda_ganha", label: "Venda Ganha" },
] as const;

export type FunnelBucketKey = (typeof FUNNEL_BUCKETS)[number]["key"];

export const DATE_TYPES = ["DATE", "DATETIME", "DATE_TIME", "date", "datetime", "Date", "DateTime"];

/** pipeline ghl_id -> bucket key -> observação exibida no funil do dashboard */
export type FunnelStageNotes = Record<string, Record<string, string>>;

/** Remove espaços nas pontas e descarta observações vazias e funis sem nenhuma observação. */
export function cleanStageNotes(notes: FunnelStageNotes): FunnelStageNotes {
  const out: FunnelStageNotes = {};
  for (const [pipelineId, byBucket] of Object.entries(notes || {})) {
    const kept: Record<string, string> = {};
    for (const [bucket, text] of Object.entries(byBucket || {})) {
      const t = (text || "").trim();
      if (t) kept[bucket] = t;
    }
    if (Object.keys(kept).length > 0) out[pipelineId] = kept;
  }
  return out;
}
