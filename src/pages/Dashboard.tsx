import { useState, useMemo, useEffect, useRef } from "react";
import { subDays, startOfDay, endOfDay, differenceInDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import { Link } from "react-router-dom";
import { Users, TrendingUp, Target, Banknote, Receipt, HandCoins, RefreshCw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useGhlData, DashboardFilters } from "@/hooks/useGhlData";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/dashboard/Header";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { FunnelVisualization } from "@/components/dashboard/FunnelVisualization";
import { SellerPerformance } from "@/components/dashboard/SellerPerformance";
import { TimePerStage } from "@/components/dashboard/TimePerStage";
import { OriginsCard } from "@/components/dashboard/OriginsCard";
import { groupTopN } from "@/lib/group-top-n";
import { buildPieColorMap } from "@/lib/pie-palette";
import { FunnelCycles } from "@/components/dashboard/FunnelCycles";
import { DataQuality } from "@/components/dashboard/DataQuality";
import { ResponseTimeCard } from "@/components/dashboard/ResponseTimeCard";
import { CustomFieldCharts } from "@/components/dashboard/CustomFieldCharts";
import { LossReasons } from "@/components/dashboard/LossReasons";
import { DailyLeads } from "@/components/dashboard/DailyLeads";
import { CoolingLeadsCard } from "@/components/dashboard/CoolingLeadsCard";
import { AIInsights } from "@/components/dashboard/AIInsights";
import { DashboardSkeleton } from "@/components/skeletons/RouteSkeletons";
import { ErrorState } from "@/components/dashboard/ErrorState";
import { AnimatedSection } from "@/components/dashboard/AnimatedSection";
import { AIUsageCard } from "@/components/dashboard/AIUsageCard";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { activeWorkspace } = useWorkspace();
  const { permissions } = usePermissions();
  const { toast } = useToast();
  // Conta na hidratação anterior — usado para mostrar o toast só quando a conta
  // REALMENTE muda (e não na primeira montagem da página).
  const prevWorkspaceRef = useRef<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 6),
    to: new Date(),
  });
  const [additionalDateRange, setAdditionalDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([]);
  const [selectedSellerIds, setSelectedSellerIds] = useState<string[]>([]);
  const [selectedUtmMedium, setSelectedUtmMedium] = useState<string | null>(null);
  const [selectedUtmCampaign, setSelectedUtmCampaign] = useState<string | null>(null);

  // Ao trocar de conta, SEMPRE redefine os filtros para o padrão da conta.
  // Os filtros não são mais memorizados entre contas: cada troca entra num
  // estado limpo e previsível. Isso evita que uma seleção antiga (ex.: IDs de
  // vendedor/etapa que mudaram após re-sync do GHL) filtre tudo para zero sem
  // pista visível. Um toast deixa claro que o contexto mudou.
  useEffect(() => {
    if (!activeWorkspace?.id) return;
    let cancelled = false;

    (async () => {
      // Reset padrão: período (últimos 7 dias) e todos os filtros zerados.
      setDateRange({ from: subDays(new Date(), 6), to: new Date() });
      setAdditionalDateRange(undefined);
      setSelectedSellerIds([]);
      setSelectedUtmMedium(null);
      setSelectedUtmCampaign(null);
      setSelectedStageIds([]);
      setSelectedPipelineId(null);

      // Aplica o pipeline padrão da conta, se configurado.
      const { data } = await supabase
        .from("ghl_dashboard_settings")
        .select("default_pipeline_ids")
        .eq("workspace_id", activeWorkspace.id)
        .maybeSingle();
      if (cancelled) return;
      const def = (data?.default_pipeline_ids || [])[0];
      if (def) setSelectedPipelineId(def);

      // Toast só quando a conta realmente muda (não na 1ª montagem).
      if (prevWorkspaceRef.current && prevWorkspaceRef.current !== activeWorkspace.id) {
        toast({
          title: `Agora vendo: ${activeWorkspace.name}`,
          description: "Filtros redefinidos para o padrão da conta.",
        });
      }
      prevWorkspaceRef.current = activeWorkspace.id;
    })();

    return () => { cancelled = true; };
  }, [activeWorkspace?.id, activeWorkspace?.name, toast]);


  const startDate = useMemo(() => startOfDay(dateRange?.from || subDays(new Date(), 6)), [dateRange?.from]);
  const endDate = useMemo(() => endOfDay(dateRange?.to || dateRange?.from || new Date()), [dateRange?.to, dateRange?.from]);

  const additionalStartDate = useMemo(
    () => (additionalDateRange?.from ? startOfDay(additionalDateRange.from) : null),
    [additionalDateRange?.from]
  );
  const additionalEndDate = useMemo(
    () => (additionalDateRange?.to || additionalDateRange?.from
      ? endOfDay(additionalDateRange.to || additionalDateRange.from!)
      : null),
    [additionalDateRange?.to, additionalDateRange?.from]
  );

  const filters: DashboardFilters = useMemo(() => ({
    startDate, endDate,
    pipelineId: selectedPipelineId,
    stageIds: selectedStageIds,
    sellerIds: selectedSellerIds,
    utmMedium: selectedUtmMedium,
    utmCampaign: selectedUtmCampaign,
    workspaceId: activeWorkspace?.id || null,
    additionalStartDate,
    additionalEndDate,
  }), [startDate, endDate, selectedPipelineId, selectedStageIds, selectedSellerIds, selectedUtmMedium, selectedUtmCampaign, activeWorkspace?.id, additionalStartDate, additionalEndDate]);

  const periodDays = useMemo(() => differenceInDays(endDate, startDate) + 1, [startDate, endDate]);
  const prevFilters: DashboardFilters = useMemo(() => ({
    ...filters,
    startDate: startOfDay(subDays(startDate, periodDays)),
    endDate: endOfDay(subDays(startDate, 1)),
    additionalStartDate: null,
    additionalEndDate: null,
  }), [filters, startDate, periodDays]);

  const { data, isLoading, isFetching, error, refetch, cachedAt } = useGhlData(filters);
  // "Aplicando filtro": busca em background com dados já na tela (não o load inicial).
  const isApplyingFilter = isFetching && !isLoading && !!data;
  const { data: prevData } = useGhlData(prevFilters, { enabled: !!data });

  // Mapa nome→cor compartilhado entre os cards de origem (leads e vendas), para
  // que a MESMA origem apareça na MESMA cor nos dois gráficos. Usa o mesmo
  // groupTopN dos cards para que os nomes e o "Outras" batam.
  const originColorMap = useMemo(
    () => buildPieColorMap(
      groupTopN(data?.leadsOriginDistribution || [], 6),
      groupTopN(data?.wonOriginDistribution || [], 6),
    ),
    [data?.leadsOriginDistribution, data?.wonOriginDistribution],
  );

  if (!activeWorkspace) {
    return <ErrorState error="Selecione uma conta para visualizar o dashboard." onRetry={() => window.location.reload()} />;
  }
  if (isLoading && !data) return <DashboardSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={() => refetch(true)} />;
  if (!data) return <ErrorState error="Sem dados. Clique em Atualizar agora para sincronizar com o VFlow360." onRetry={() => refetch(true)} />;

  const formatPercentage = (v: number) => `${v.toFixed(1)}%`;
  const formatBRL = (v: number) => {
    if (v >= 100_000) {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(v);
    }
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
  };
  const calcTrend = (cur: number, prev: number) => {
    if (prev === 0) return cur > 0 ? { value: 100, isPositive: true } : undefined;
    const ch = ((cur - prev) / prev) * 100;
    if (Math.abs(ch) < 0.1) return undefined;
    return { value: Math.round(Math.abs(ch) * 10) / 10, isPositive: ch > 0 };
  };

  const currentWon = data.funnelStages.find((s) => s.id === "venda_ganha")?.count || 0;
  const prevWon = prevData?.funnelStages.find((s) => s.id === "venda_ganha")?.count || 0;

  const leadsTrend = prevData ? calcTrend(data.totalLeads, prevData.totalLeads) : undefined;
  const wonTrend = prevData ? calcTrend(currentWon, prevWon) : undefined;
  const convTrend = prevData ? calcTrend(data.conversionRates.overallConversion, prevData.conversionRates.overallConversion) : undefined;

  const wonRevenue = data.wonMonetary ?? 0;
  const negotiatingRevenue = data.negotiatingMonetary ?? 0;
  const ticketAvg = currentWon > 0 ? wonRevenue / currentWon : 0;
  const prevWonRevenue = prevData?.wonMonetary ?? 0;
  const prevNegotiatingRevenue = prevData?.negotiatingMonetary ?? 0;
  const prevTicketAvg = prevWon > 0 ? prevWonRevenue / prevWon : 0;
  const revenueTrend = prevData ? calcTrend(wonRevenue, prevWonRevenue) : undefined;
  const negotiatingTrend = prevData ? calcTrend(negotiatingRevenue, prevNegotiatingRevenue) : undefined;
  const ticketTrend = prevData ? calcTrend(ticketAvg, prevTicketAvg) : undefined;

  return (
    <div className="space-y-5 sm:space-y-6">
      <Header
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        onRefresh={refetch}
        isLoading={isLoading}
        pipelines={data.pipelines}
        users={data.users}
        selectedPipelineId={selectedPipelineId}
        selectedStageIds={selectedStageIds}
        selectedSellerIds={selectedSellerIds}
        utmMediumValues={data.utmMediumValues || []}
        utmCampaignValues={data.utmCampaignValues || []}
        selectedUtmMedium={selectedUtmMedium}
        selectedUtmCampaign={selectedUtmCampaign}
        onPipelineChange={(id) => { setSelectedPipelineId(id); setSelectedStageIds([]); }}
        onStageIdsChange={setSelectedStageIds}
        onSellerIdsChange={setSelectedSellerIds}
        onUtmMediumChange={setSelectedUtmMedium}
        onUtmCampaignChange={setSelectedUtmCampaign}
        cachedAt={cachedAt}
        additionalDateRange={additionalDateRange}
        onAdditionalDateRangeChange={setAdditionalDateRange}
        additionalDateLabel={data.additionalDateFieldName || null}
      />

      {/* Barra de progresso ao aplicar filtros — feedback de que a busca está rodando. */}
      <div
        className="relative h-0.5 -mt-2 overflow-hidden rounded-full"
        role="status"
        aria-label={isApplyingFilter ? "Aplicando filtros" : undefined}
        aria-hidden={!isApplyingFilter}
      >
        {isApplyingFilter && (
          <span className="absolute inset-y-0 rounded-full bg-primary animate-progress-indeterminate" />
        )}
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">{activeWorkspace.name} · oportunidades VFlow360</p>
        </div>

        {/* Status + ação */}
        <div className="flex items-center gap-2 shrink-0">
          {cachedAt && !isLoading && (
            <span className="hidden md:inline text-[11px] text-muted-foreground">
              Atualizado {format(new Date(cachedAt), "HH:mm", { locale: ptBR })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 gap-1.5 text-xs"
            onClick={() => refetch(true)}
            disabled={isLoading}
            title="Forçar atualização"
            aria-label="Atualizar dados do dashboard"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} aria-hidden="true" />
            <span>Atualizar</span>
          </Button>
          {permissions.viewSettings && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 gap-1.5 text-xs"
              asChild
              title="Personalizar dashboard"
            >
              <Link to="/settings/dashboard" aria-label="Personalizar dashboard">
                <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Personalizar</span>
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Conteúdo do dashboard — atenua e bloqueia interação enquanto o filtro
          é aplicado, voltando ao normal quando os novos dados chegam. */}
      <div
        className={cn(
          "space-y-5 sm:space-y-6 transition-opacity duration-200",
          isApplyingFilter && "opacity-50 pointer-events-none",
        )}
        aria-busy={isApplyingFilter}
      >
      <AnimatedSection className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 lg:gap-5">
        <MetricCard title="Total de Oportunidades" value={data.totalLeads} icon={Users} variant="default" tooltip="Quantidade total de oportunidades criadas no período filtrado." trend={leadsTrend} />
        <MetricCard title="Vendas Ganhas" value={currentWon} icon={Target} variant="success" tooltip="Oportunidades que chegaram à etapa de venda ganha no período." trend={wonTrend} />
        <MetricCard title="Taxa de Conversão" value={formatPercentage(data.conversionRates.overallConversion)} icon={TrendingUp} variant="accent" tooltip="Percentual da primeira etapa até venda ganha." trend={convTrend} />
        <MetricCard title="Receita Ganha" value={formatBRL(wonRevenue)} icon={Banknote} variant="success" tooltip="Soma dos valores monetários das oportunidades marcadas como Venda Ganha no período." trend={revenueTrend} />
        <MetricCard title="Em Negociação" value={formatBRL(negotiatingRevenue)} icon={HandCoins} variant="accent" tooltip="Soma dos valores monetários das oportunidades nas etapas Proposta Enviada e Fechamento — receita potencial em jogo no pipeline." trend={negotiatingTrend} />
        <MetricCard title="Ticket Médio" value={formatBRL(ticketAvg)} icon={Receipt} variant="default" tooltip="Receita ganha dividida pela quantidade de vendas ganhas no período." trend={ticketTrend} />
      </AnimatedSection>


      <AnimatedSection className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6" delay={0.05}>
        <div className="lg:col-span-1">
          <FunnelVisualization
            funnelStages={data.funnelStages}
            conversionRates={data.conversionRates}
            lostLeads={data.lostLeads || 0}
            lostLeadsDetail={data.lostLeadsDetail || []}
            belowLostCard={
              <FunnelCycles
                cycleToWonDays={data.cycleToWonDays ?? 0}
                cycleToWonSample={data.cycleToWonSample ?? 0}
                cycleToLostDays={data.cycleToLostDays ?? 0}
                cycleToLostSample={data.cycleToLostSample ?? 0}
              />
            }
          />
        </div>
        <div className="lg:col-span-1 lg:relative">
          <AIInsights />
        </div>
      </AnimatedSection>

      <AnimatedSection className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6" delay={0.05}>
        <OriginsCard
          mode="leads"
          distribution={data.leadsOriginDistribution || []}
          fillRate={data.leadsOriginFillRate || 0}
          configured={data.utmConfigured?.source || false}
          colorMap={originColorMap}
        />
        <OriginsCard
          mode="wins"
          distribution={data.wonOriginDistribution || []}
          fillRate={data.wonOriginFillRate || 0}
          configured={data.utmConfigured?.source || false}
          colorMap={originColorMap}
        />
        <LossReasons lossReasons={data.lossReasons || []} totalLost={data.lostLeads || 0} />
      </AnimatedSection>

      {data.customFieldDistributions && data.customFieldDistributions.length > 0 && (
        <AnimatedSection delay={0.05}>
          <CustomFieldCharts fields={data.customFieldDistributions} />
        </AnimatedSection>
      )}

      <AnimatedSection className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6" delay={0.05}>
        <div className="lg:col-span-2">
          <DataQuality customFields={data.customFields} overallFillRate={data.overallFillRate} />
        </div>
        <ResponseTimeCard responseTime={data.responseTime} prevResponseTime={prevData?.responseTime} />
      </AnimatedSection>

      <AnimatedSection delay={0.05}>
        <SellerPerformance
          sellers={data.sellers}
          selectedSellerIds={selectedSellerIds}
          onSellerToggle={(id) => setSelectedSellerIds((prev) => prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id])}
          onClearSellers={() => setSelectedSellerIds([])}
        />
      </AnimatedSection>

      <AnimatedSection delay={0.05}>
        <CoolingLeadsCard data={data.coolingLeads} />
      </AnimatedSection>

      <AnimatedSection delay={0.05}>
        <DailyLeads dailyLeads={data.dailyLeads || []} />
      </AnimatedSection>

      <AnimatedSection delay={0.05}>
        <TimePerStage averageTimePerStage={data.averageTimePerStage} />
      </AnimatedSection>

      <AnimatedSection delay={0.05}>
        <AIUsageCard startDate={startDate} endDate={endDate} />
      </AnimatedSection>
      </div>
    </div>
  );
}
