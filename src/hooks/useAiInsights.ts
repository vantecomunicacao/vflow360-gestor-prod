import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type InsightKind = "gargalo" | "tendencia" | "oportunidade" | "alerta";
export type InsightSeverity = "info" | "warn" | "high";

export interface AiInsight {
  id: string;
  kind: InsightKind;
  title: string;
  body: string;
  severity: InsightSeverity;
  period_label: string | null;
  refs: { scope?: string; pipeline_id?: string | null; pipeline_name?: string | null } | null;
  status: string;
  created_at: string;
}

interface BatchResult {
  insights: AiInsight[];          // ativos do lote mais recente
  dismissedCount: number;         // dispensados no mesmo lote (restauráveis)
  period: { start: string | null; end: string | null };
  batchId: string | null;
}

// Lê o LOTE mais recente do Analista (RLS: gestor/admin). Mostra os ativos; mantém
// os dispensados contabilizados para o "Restaurar todos". Gerado por ai-insights-generate.
export function useAiInsights(workspaceId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery<BatchResult, Error>({
    queryKey: ["ai-insights", workspaceId],
    queryFn: async () => {
      const table = () => supabase.from("ai_insights" as any) as any;

      // 1) Linha mais nova → identifica o lote e o período.
      const { data: latest, error: e1 } = await table()
        .select("batch_id, period_start, period_end")
        .eq("workspace_id", workspaceId as string)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (e1) throw new Error(e1.message);

      const period = { start: latest?.period_start ?? null, end: latest?.period_end ?? null };
      const batchId: string | null = latest?.batch_id ?? null;

      // 2) Carrega o lote (ativos + dispensados). Fallback p/ linhas antigas sem batch_id.
      let rowsQuery = table()
        .select("id, kind, title, body, severity, period_label, refs, status, created_at")
        .eq("workspace_id", workspaceId as string)
        .order("created_at", { ascending: false });
      rowsQuery = batchId ? rowsQuery.eq("batch_id", batchId) : rowsQuery.eq("status", "active");

      const { data, error } = await rowsQuery;
      if (error) throw new Error(error.message);

      const rows = (data || []) as AiInsight[];
      return {
        insights: rows.filter((r) => r.status === "active"),
        dismissedCount: rows.filter((r) => r.status === "dismissed").length,
        period,
        batchId,
      };
    },
    enabled: !!workspaceId,
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("ai_insights" as any) as any)
        .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-insights", workspaceId] }),
    onError: (e: Error) => {
      toast({ title: "Erro ao dispensar insight", description: e.message, variant: "destructive" });
    },
  });

  // Restaura todos os dispensados do lote atual (relê os mesmos da semana, sem gerar novos).
  const restoreAll = useMutation({
    mutationFn: async (batchId: string) => {
      const { error } = await (supabase.from("ai_insights" as any) as any)
        .update({ status: "active", dismissed_at: null })
        .eq("workspace_id", workspaceId as string)
        .eq("batch_id", batchId)
        .eq("status", "dismissed");
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-insights", workspaceId] }),
    onError: (e: Error) => {
      toast({ title: "Erro ao restaurar insights", description: e.message, variant: "destructive" });
    },
  });

  return {
    insights: query.data?.insights ?? [],
    dismissedCount: query.data?.dismissedCount ?? 0,
    period: query.data?.period ?? { start: null, end: null },
    batchId: query.data?.batchId ?? null,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    dismiss: (id: string) => dismiss.mutate(id),
    isDismissing: dismiss.isPending,
    restoreAll: (batchId: string) => restoreAll.mutate(batchId),
    isRestoring: restoreAll.isPending,
  };
}
