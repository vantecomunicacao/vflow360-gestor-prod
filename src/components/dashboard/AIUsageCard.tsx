import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

interface Props {
  startDate: Date;
  endDate: Date;
}

export function AIUsageCard({ startDate, endDate }: Props) {
  const { activeWorkspace } = useWorkspace();

  const { data, isLoading } = useQuery({
    queryKey: ["ai-usage", activeWorkspace?.id, startDate.toISOString(), endDate.toISOString()],
    queryFn: async () => {
      if (!activeWorkspace) return [];
      const { data, error } = await supabase
        .from("ai_usage_log")
        .select("provider, model")
        .eq("workspace_id", activeWorkspace.id)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!activeWorkspace,
    staleTime: 60_000,
  });

  const rows = data ?? [];

  const totalCalls = rows.length;

  const byModel = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.provider}/${r.model}`;
    byModel.set(key, (byModel.get(key) || 0) + 1);
  }

  const fmtNum = (v: number) => v.toLocaleString("pt-BR");
  const plural = (v: number) => (v === 1 ? "chamada" : "chamadas");

  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary-ink" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Consumo de IA (Sugestões)</h2>
          <p className="text-xs text-muted-foreground">Chamadas de IA no período filtrado</p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : totalCalls === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma análise de IA registrada neste período.</p>
      ) : (
        <>
          <div className="mb-5 max-w-[220px]">
            <Stat label="Chamadas" value={fmtNum(totalCalls)} highlight />
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Por modelo</p>
            <div className="space-y-2">
              {[...byModel.entries()].map(([key, calls]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="text-foreground font-medium">{key}</span>
                  <span className="text-muted-foreground">
                    {fmtNum(calls)} {plural(calls)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${highlight ? "text-primary-ink" : "text-foreground"}`}>{value}</p>
    </div>
  );
}
