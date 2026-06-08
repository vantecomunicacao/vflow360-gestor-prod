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
  created_at: string;
}

// Le os insights ativos do workspace (RLS: gestor/admin). Leitura direta da
// tabela ai_insights — gerada offline por ai-insights-generate (cron diario).
export function useAiInsights(workspaceId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery<AiInsight[], Error>({
    queryKey: ["ai-insights", workspaceId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("ai_insights" as any) as any)
        .select("id, kind, title, body, severity, period_label, refs, created_at")
        .eq("workspace_id", workspaceId as string)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data || []) as AiInsight[];
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-insights", workspaceId] });
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao dispensar insight", description: e.message, variant: "destructive" });
    },
  });

  return {
    insights: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    dismiss: (id: string) => dismiss.mutate(id),
    isDismissing: dismiss.isPending,
  };
}
