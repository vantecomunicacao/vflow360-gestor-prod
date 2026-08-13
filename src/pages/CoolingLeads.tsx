import { useState } from "react";
import { RefreshCw, Snowflake, GitBranch, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useCoolingLeads } from "@/hooks/useCoolingLeads";
import { useGhlFilterOptions } from "@/hooks/useGhlFilterOptions";
import { CoolingLeadsCard } from "@/components/dashboard/CoolingLeadsCard";
import { FilterSelect, MultiFilterSelect } from "@/components/dashboard/FilterControls";
import { ErrorState } from "@/components/dashboard/ErrorState";

export default function CoolingLeads() {
  const { activeWorkspace } = useWorkspace();
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [sellerIds, setSellerIds] = useState<string[]>([]);
  const { data, isLoading, isFetching, error, refetch } = useCoolingLeads(
    activeWorkspace?.id || null,
    { pipelineId, sellerIds },
  );
  const { data: options } = useGhlFilterOptions(activeWorkspace?.id || null);

  if (!activeWorkspace) {
    return <ErrorState error="Selecione uma conta para visualizar os leads esfriando." onRetry={() => window.location.reload()} />;
  }

  // Vendedor com vínculo em user_ghl_links só enxerga as próprias oportunidades:
  // o servidor força o escopo, então o filtro de vendedor não faria nada.
  const showSellerFilter = data?.scope === "workspace";
  const hasFilters = !!pipelineId || sellerIds.length > 0;

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

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          value={pipelineId}
          onChange={setPipelineId}
          placeholder="Funil"
          icon={GitBranch}
          options={options?.pipelines.map((p) => ({ id: p.id, name: p.name })) || []}
        />
        {showSellerFilter && (
          <MultiFilterSelect
            values={sellerIds}
            onChange={setSellerIds}
            placeholder="Vendedor"
            pluralLabel="vendedores"
            icon={Users}
            options={options?.users.map((u) => ({ id: u.id, name: u.name })) || []}
          />
        )}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 gap-1 text-xs text-muted-foreground"
            onClick={() => { setPipelineId(null); setSellerIds([]); }}
          >
            <X className="w-3 h-3" aria-hidden="true" />
            Limpar filtros
          </Button>
        )}
      </div>

      {error && !data ? (
        <ErrorState error={error.message} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="dashboard-section animate-pulse h-40" />
      ) : (
        <div className={cn(isFetching && "opacity-60 transition-opacity")}>
          <CoolingLeadsCard data={data} />
        </div>
      )}
    </div>
  );
}
