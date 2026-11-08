import { useEffect, useMemo, useState } from "react";
import { subDays, startOfDay, endOfDay, differenceInDays } from "date-fns";
import { DateRange } from "react-day-picker";
import { RefreshCw, TrendingUp, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useMyPerformance } from "@/hooks/useMyPerformance";
import { Header } from "@/components/dashboard/Header";
import { DataQuality } from "@/components/dashboard/DataQuality";
import { ResponseTimeCard } from "@/components/dashboard/ResponseTimeCard";
import { IncompleteLeadsCard } from "@/components/dashboard/IncompleteLeadsCard";

/** Tela do vendedor: Qualidade de Preenchimento e Tempo Médio de Resposta.
 *  Usuário vinculado a um vendedor do GHL fica travado nele (o servidor decide
 *  e a tela só mostra o nome). Sem vínculo, como num login compartilhado por
 *  vários vendedores, aparece o filtro de vendedor. */
export default function MyPerformance() {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id || null;
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 6),
    to: new Date(),
  });
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [stageIds, setStageIds] = useState<string[]>([]);
  const [sellerIds, setSellerIds] = useState<string[]>([]);
  // Só busca depois de aplicar o funil padrão da conta (mesmo ponto de partida
  // do Dashboard), para não calcular duas vezes na abertura.
  const [readyWorkspaceId, setReadyWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    setPipelineId(null);
    setStageIds([]);
    setSellerIds([]);
    supabase
      .from("ghl_dashboard_settings")
      .select("default_pipeline_ids")
      .eq("workspace_id", workspaceId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const def = (data?.default_pipeline_ids || [])[0];
        if (def) setPipelineId(def);
        setReadyWorkspaceId(workspaceId);
      });
    return () => { cancelled = true; };
  }, [workspaceId]);

  const startDate = useMemo(() => startOfDay(dateRange?.from || subDays(new Date(), 6)), [dateRange?.from]);
  const endDate = useMemo(() => endOfDay(dateRange?.to || dateRange?.from || new Date()), [dateRange?.to, dateRange?.from]);
  const ready = !!workspaceId && readyWorkspaceId === workspaceId;

  const filters = useMemo(
    () => ({ workspaceId, startDate, endDate, pipelineId, stageIds, sellerIds }),
    [workspaceId, startDate, endDate, pipelineId, stageIds, sellerIds],
  );
  const { data, isLoading, isFetching, error, refetch } = useMyPerformance(filters, { enabled: ready });

  // Período anterior de mesma duração, para a seta de "mais rápido/mais lento".
  const periodDays = differenceInDays(endDate, startDate) + 1;
  const prevFilters = useMemo(() => ({
    ...filters,
    startDate: startOfDay(subDays(startDate, periodDays)),
    endDate: endOfDay(subDays(startDate, 1)),
  }), [filters, startDate, periodDays]);
  const { data: prevData } = useMyPerformance(prevFilters, { enabled: ready && !!data });

  const locked = !!data?.sellerLocked;
  const subtitle = (() => {
    if (!data) return "Qualidade de preenchimento e tempo de resposta dos seus leads";
    const opps = `${data.totalLeads} oportunidade${data.totalLeads === 1 ? "" : "s"} no período`;
    if (locked) return data.sellerName ? `Seus leads como ${data.sellerName} · ${opps}` : opps;
    if (sellerIds.length === 0) return `Todos os vendedores · ${opps}`;
    if (sellerIds.length === 1) return `Leads de ${data.sellerName || "1 vendedor"} · ${opps}`;
    return `${sellerIds.length} vendedores · ${opps}`;
  })();

  if (!activeWorkspace) {
    return (
      <div className="dashboard-section text-center text-sm text-muted-foreground py-10">
        Selecione uma conta para ver o seu desempenho.
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <Header
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        onRefresh={() => refetch()}
        isLoading={isLoading}
        pipelines={data?.pipelines || []}
        users={locked ? [] : data?.users || []}
        selectedPipelineId={pipelineId}
        selectedStageIds={stageIds}
        selectedSellerIds={locked ? [] : sellerIds}
        onPipelineChange={(id) => { setPipelineId(id); setStageIds([]); }}
        onStageIdsChange={setStageIds}
        onSellerIdsChange={data && !locked ? setSellerIds : undefined}
        lockedSellerName={locked ? data?.sellerName : null}
      />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary-ink" />
            Meu desempenho
          </h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 gap-1.5 text-xs shrink-0"
          onClick={() => refetch()}
          disabled={isFetching || !ready}
          aria-label="Atualizar meu desempenho"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} aria-hidden="true" />
          <span>Atualizar</span>
        </Button>
      </div>

      {error && !data ? (
        <div className="dashboard-section flex flex-col items-center text-center gap-3 py-10">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <Link2Off className="w-6 h-6 text-destructive-ink" aria-hidden="true" />
          </div>
          <p className="text-sm text-foreground max-w-md">{error.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            Tentar novamente
          </Button>
        </div>
      ) : !data ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
          <div className="lg:col-span-2 dashboard-section animate-pulse h-72" />
          <div className="dashboard-section animate-pulse h-72" />
        </div>
      ) : (
        <div className={cn("space-y-5 sm:space-y-6", isFetching && "opacity-60 transition-opacity")}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
            <div className="lg:col-span-2">
              <DataQuality customFields={data.customFields} overallFillRate={data.overallFillRate} />
            </div>
            <ResponseTimeCard responseTime={data.responseTime} prevResponseTime={prevData?.responseTime} />
          </div>
          <IncompleteLeadsCard
            leads={data.incompleteLeads}
            total={data.incompleteLeadsTotal}
            ghlLocationId={data.ghlLocationId}
            showSeller={!locked && sellerIds.length !== 1}
          />
        </div>
      )}
    </div>
  );
}
