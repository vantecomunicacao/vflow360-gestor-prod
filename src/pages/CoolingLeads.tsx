import { RefreshCw, Snowflake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useCoolingLeads } from "@/hooks/useCoolingLeads";
import { CoolingLeadsCard } from "@/components/dashboard/CoolingLeadsCard";
import { ErrorState } from "@/components/dashboard/ErrorState";

export default function CoolingLeads() {
  const { activeWorkspace } = useWorkspace();
  const { data, isLoading, isFetching, error, refetch } = useCoolingLeads(activeWorkspace?.id || null);

  if (!activeWorkspace) {
    return <ErrorState error="Selecione uma conta para visualizar os leads esfriando." onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Snowflake className="w-6 h-6 text-primary-ink" />
            Leads esfriando
          </h1>
          <p className="text-muted-foreground">
            {data?.scope === "seller"
              ? "Suas oportunidades abertas sem atividade recente"
              : "Oportunidades abertas sem atividade recente"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 gap-1.5 text-xs shrink-0"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="Atualizar leads esfriando"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} aria-hidden="true" />
          <span>Atualizar</span>
        </Button>
      </div>

      {error && !data ? (
        <ErrorState error={error.message} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="dashboard-section animate-pulse h-40" />
      ) : (
        <CoolingLeadsCard data={data} />
      )}
    </div>
  );
}
