import { Sparkles, X, TrendingUp, AlertTriangle, Target, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAiInsights, type InsightKind, type InsightSeverity } from "@/hooks/useAiInsights";

const KIND_ICON: Record<InsightKind, typeof Sparkles> = {
  gargalo: AlertTriangle,
  tendencia: TrendingUp,
  oportunidade: Target,
  alerta: Activity,
};

const SEVERITY_STYLE: Record<InsightSeverity, string> = {
  info: "border-border",
  warn: "border-amber-400/50 bg-amber-50/40 dark:bg-amber-950/20",
  high: "border-red-400/50 bg-red-50/40 dark:bg-red-950/20",
};

export function AIInsights() {
  const { activeWorkspace } = useWorkspace();
  const { insights, isLoading, dismiss, isDismissing } = useAiInsights(activeWorkspace?.id);

  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6 h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-accent/10">
            <Sparkles className="h-5 w-5 text-primary-ink" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Insights com I.A.</h2>
        </div>
        {insights.length > 0 && (
          <Badge variant="secondary" className="text-xs">{insights.length}</Badge>
        )}
      </div>

      {isLoading ? (
        <div className="flex-1 space-y-3 py-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : insights.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-8">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-accent/20 blur-2xl" />
            <div className="relative p-4 rounded-full bg-gradient-to-br from-accent/20 to-primary/20 border border-accent/30">
              <Sparkles className="h-8 w-8 text-primary-ink" />
            </div>
          </div>
          <div className="max-w-xs space-y-2">
            <p className="text-sm font-medium text-foreground">Nenhum insight no momento</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              A IA analisa seu funil diariamente e aponta aqui gargalos, tendências e oportunidades a partir dos seus dados.
            </p>
          </div>
        </div>
      ) : (
        <ul className="flex-1 space-y-3 overflow-y-auto pr-1">
          {insights.map((ins) => {
            const Icon = KIND_ICON[ins.kind] ?? Sparkles;
            return (
              <li
                key={ins.id}
                className={`group relative rounded-lg border p-3 ${SEVERITY_STYLE[ins.severity]}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-1.5 rounded-md bg-accent/10 shrink-0">
                    <Icon className="h-4 w-4 text-primary-ink" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{ins.title}</p>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{ins.body}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {ins.refs?.pipeline_name || "Visão geral"}
                      </Badge>
                      {ins.period_label && (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                          {ins.period_label}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    disabled={isDismissing}
                    onClick={() => dismiss(ins.id)}
                    aria-label="Dispensar insight"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
