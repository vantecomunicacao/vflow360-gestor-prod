import { useState, useMemo, useEffect } from "react";
import { subDays, startOfDay, endOfDay, differenceInDays } from "date-fns";
import { DateRange } from "react-day-picker";
import { Users, TrendingUp, Target, Banknote, Receipt, HandCoins } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useGhlData, DashboardFilters } from "@/hooks/useGhlData";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/dashboard/Header";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { FunnelVisualization } from "@/components/dashboard/FunnelVisualization";
import { SellerPerformance } from "@/components/dashboard/SellerPerformance";
import { TimePerStage } from "@/components/dashboard/TimePerStage";
import { OriginsCard } from "@/components/dashboard/OriginsCard";
import { FunnelCycles } from "@/components/dashboard/FunnelCycles";
import { DataQuality } from "@/components/dashboard/DataQuality";
import { ResponseTimeCard } from "@/components/dashboard/ResponseTimeCard";
import { CustomFieldCharts } from "@/components/dashboard/CustomFieldCharts";
import { LossReasons } from "@/components/dashboard/LossReasons";
import { DailyLeads } from "@/components/dashboard/DailyLeads";
import { AIInsights } from "@/components/dashboard/AIInsights";
import { DashboardSkeleton } from "@/components/skeletons/RouteSkeletons";
import { ErrorState } from "@/components/dashboard/ErrorState";
import { AnimatedSection } from "@/components/dashboard/AnimatedSection";
import { AIUsageCard } from "@/components/dashboard/AIUsageCard";

type SavedFilters = {
  from?: string;
  to?: string;
  addFrom?: string;
  addTo?: string;
  pipelineId?: string | null;
  stageId?: string | null;
  sellerId?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
};

const filtersStorageKey = (workspaceId: string) => `dashboard:filters:${workspaceId}`;

export default function Dashboard() {
  const { activeWorkspace } = useWorkspace();
  const [hydrated, setHydrated] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 6),
    to: new Date(),
  });
  const [additionalDateRange, setAdditionalDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [selectedUtmMedium, setSelectedUtmMedium] = useState<string | null>(null);
  const [selectedUtmCampaign, setSelectedUtmCampaign] = useState<string | null>(null);

  // Hidratar filtros salvos por workspace (ou aplicar pipeline padrão)
  useEffect(() => {
    setHydrated(false);
    if (!activeWorkspace?.id) return;
    let cancelled = false;

    (async () => {
      // 1) Tentar restaurar filtros salvos (inclusive período)
      let restored = false;
      try {
        const raw = localStorage.getItem(filtersStorageKey(activeWorkspace.id));
        if (raw) {
          const saved = JSON.parse(raw) as SavedFilters;
          setDateRange(
            saved.from
              ? { from: new Date(saved.from), to: saved.to ? new Date(saved.to) : undefined }
              : { from: subDays(new Date(), 6), to: new Date() }
          );
          setAdditionalDateRange(
            saved.addFrom
              ? { from: new Date(saved.addFrom), to: saved.addTo ? new Date(saved.addTo) : undefined }
              : undefined
          );
          setSelectedPipelineId(saved.pipelineId ?? null);
          setSelectedStageId(saved.stageId ?? null);
          setSelectedSellerId(saved.sellerId ?? null);
          setSelectedUtmMedium(saved.utmMedium ?? null);
          setSelectedUtmCampaign(saved.utmCampaign ?? null);
          restored = true;
        }
      } catch {
        // ignora storage corrompido
      }

      if (!restored) {
        // Reset padrão
        setDateRange({ from: subDays(new Date(), 6), to: new Date() });
        setAdditionalDateRange(undefined);
        setSelectedSellerId(null);
        setSelectedUtmMedium(null);
        setSelectedUtmCampaign(null);
        setSelectedStageId(null);
        setSelectedPipelineId(null);

        // Aplicar pipeline padrão do workspace
        const { data } = await supabase
          .from("ghl_dashboard_settings")
          .select("default_pipeline_ids")
          .eq("workspace_id", activeWorkspace.id)
          .maybeSingle();
        if (cancelled) return;
        const def = (data?.default_pipeline_ids || [])[0];
        if (def) setSelectedPipelineId(def);
      }

      if (!cancelled) setHydrated(true);
    })();

    return () => { cancelled = true; };
  }, [activeWorkspace?.id]);

  // Persistir filtros no localStorage por workspace
  useEffect(() => {
    if (!hydrated || !activeWorkspace?.id) return;
    const payload: SavedFilters = {
      from: dateRange?.from ? dateRange.from.toISOString() : undefined,
      to: dateRange?.to ? dateRange.to.toISOString() : undefined,
      addFrom: additionalDateRange?.from ? additionalDateRange.from.toISOString() : undefined,
      addTo: additionalDateRange?.to ? additionalDateRange.to.toISOString() : undefined,
      pipelineId: selectedPipelineId,
      stageId: selectedStageId,
      sellerId: selectedSellerId,
      utmMedium: selectedUtmMedium,
      utmCampaign: selectedUtmCampaign,
    };
    try {
      localStorage.setItem(filtersStorageKey(activeWorkspace.id), JSON.stringify(payload));
    } catch {
      // ignora quota cheia
    }
  }, [hydrated, activeWorkspace?.id, dateRange, additionalDateRange, selectedPipelineId, selectedStageId, selectedSellerId, selectedUtmMedium, selectedUtmCampaign]);


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
    stageId: selectedStageId,
    sellerId: selectedSellerId,
    utmMedium: selectedUtmMedium,
    utmCampaign: selectedUtmCampaign,
    workspaceId: activeWorkspace?.id || null,
    additionalStartDate,
    additionalEndDate,
  }), [startDate, endDate, selectedPipelineId, selectedStageId, selectedSellerId, selectedUtmMedium, selectedUtmCampaign, activeWorkspace?.id, additionalStartDate, additionalEndDate]);

  const periodDays = useMemo(() => differenceInDays(endDate, startDate) + 1, [startDate, endDate]);
  const prevFilters: DashboardFilters = useMemo(() => ({
    ...filters,
    startDate: startOfDay(subDays(startDate, periodDays)),
    endDate: endOfDay(subDays(startDate, 1)),
    additionalStartDate: null,
    additionalEndDate: null,
  }), [filters, startDate, periodDays]);

  const { data, isLoading, error, refetch, cachedAt } = useGhlData(filters);
  const { data: prevData } = useGhlData(prevFilters, { enabled: !!data });

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
        selectedStageId={selectedStageId}
        selectedSellerId={selectedSellerId}
        utmMediumValues={data.utmMediumValues || []}
        utmCampaignValues={data.utmCampaignValues || []}
        selectedUtmMedium={selectedUtmMedium}
        selectedUtmCampaign={selectedUtmCampaign}
        onPipelineChange={(id) => { setSelectedPipelineId(id); setSelectedStageId(null); }}
        onStageChange={setSelectedStageId}
        onSellerChange={setSelectedSellerId}
        onUtmMediumChange={setSelectedUtmMedium}
        onUtmCampaignChange={setSelectedUtmCampaign}
        cachedAt={cachedAt}
        additionalDateRange={additionalDateRange}
        onAdditionalDateRangeChange={setAdditionalDateRange}
        additionalDateLabel={data.additionalDateFieldName || null}
      />

      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">{activeWorkspace.name} · oportunidades VFlow360</p>
      </div>

      <AnimatedSection className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 lg:gap-5">
        <MetricCard title="Total de Oportunidades" value={data.totalLeads} icon={Users} variant="default" tooltip="Quantidade total de oportunidades criadas no período filtrado." trend={leadsTrend} />
        <MetricCard title="Vendas Ganhas" value={currentWon} icon={Target} variant="success" tooltip="Oportunidades que chegaram à etapa de venda ganha no período." trend={wonTrend} />
        <MetricCard title="Taxa de Conversão" value={formatPercentage(data.conversionRates.overallConversion)} icon={TrendingUp} variant="accent" tooltip="Percentual da primeira etapa até venda ganha." trend={convTrend} />
        <MetricCard title="Receita Ganha" value={formatBRL(wonRevenue)} icon={Banknote} variant="success" tooltip="Soma dos valores monetários das oportunidades marcadas como Venda Ganha no período." trend={revenueTrend} />
        <MetricCard title="Em Negociação" value={formatBRL(negotiatingRevenue)} icon={HandCoins} variant="accent" tooltip="Soma dos valores monetários das oportunidades nas etapas Proposta Enviada e Fechamento — receita potencial em jogo no pipeline." trend={negotiatingTrend} />
        <MetricCard title="Ticket Médio" value={formatBRL(ticketAvg)} icon={Receipt} variant="default" tooltip="Receita ganha dividida pela quantidade de vendas ganhas no período." trend={ticketTrend} />
      </AnimatedSection>


      <AnimatedSection className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6" delay={0.05}>
        <div className="lg:col-span-2">
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
        <div className="lg:col-span-1">
          <AIInsights />
        </div>
      </AnimatedSection>

      <AnimatedSection className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6" delay={0.05}>
        <OriginsCard
          mode="leads"
          distribution={data.leadsOriginDistribution || []}
          fillRate={data.leadsOriginFillRate || 0}
          configured={data.utmConfigured?.source || false}
        />
        <OriginsCard
          mode="wins"
          distribution={data.wonOriginDistribution || []}
          fillRate={data.wonOriginFillRate || 0}
          configured={data.utmConfigured?.source || false}
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
          selectedSellerId={selectedSellerId}
          onSellerClick={setSelectedSellerId}
        />
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
  );
}
