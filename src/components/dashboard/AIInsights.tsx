import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function AIInsights() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6 h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-accent/10">
            <Sparkles className="h-5 w-5 text-primary-ink" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Insights com I.A.</h2>
        </div>
        <Badge variant="secondary" className="text-xs">Em breve</Badge>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-8">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-accent/20 blur-2xl" />
          <div className="relative p-4 rounded-full bg-gradient-to-br from-accent/20 to-primary/20 border border-accent/30">
            <Sparkles className="h-8 w-8 text-primary-ink" />
          </div>
        </div>
        <div className="max-w-xs space-y-2">
          <p className="text-sm font-medium text-foreground">
            Análises inteligentes do seu funil
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Em breve a IA vai identificar gargalos, oportunidades de melhoria e tendências automaticamente a partir dos seus dados.
          </p>
        </div>
      </div>
    </div>
  );
}
