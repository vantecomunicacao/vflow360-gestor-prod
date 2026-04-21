import { useState, useMemo, useEffect } from "react";
import { subDays, startOfDay, endOfDay, differenceInDays } from "date-fns";
import { DateRange } from "react-day-picker";
import { Users, TrendingUp, Target, BarChart3, DollarSign, Receipt } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useGhlData, DashboardFilters } from "@/hooks/useGhlData";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/dashboard/Header";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { FunnelVisualization } from "@/components/dashboard/FunnelVisualization";
import { SellerPerformance } from "@/components/dashboard/SellerPerformance";
import { TimePerStage } from "@/components/dashboard/TimePerStage";
import { LeadOrigins } from "@/components/dashboard/LeadOrigins";
import { SalesOrigins } from "@/components/dashboard/SalesOrigins";
import { DataQuality } from "@/components/dashboard/DataQuality";
import { LossReasons } from "@/components/dashboard/LossReasons";
import { DailyLeads } from "@/components/dashboard/DailyLeads";
import { LoadingState } from "@/components/dashboard/LoadingState";
import { ErrorState } from "@/components/dashboard/ErrorState";
import { AnimatedSection } from "@/components/dashboard/AnimatedSection";

export default function Dashboard() {
  const { activeWorkspace } = useWorkspace();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [additionalDateRange, setAdditionalDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [selectedOrigin, setSelectedOrigin] = useState<string | null>(null);

  // Reset filtros ao trocar de workspace
  useEffect(() => {
    setSelectedPipelineId(null);
    setSelectedSellerId(null);
    setSelectedOrigin(null);
    setAdditionalDateRange(undefined);
  }, [activeWorkspace?.id]);

  const startDate = useMemo(() => startOfDay(dateRange?.from || subDays(new Date(), 30)), [dateRange?.from]);
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
    sellerId: selectedSellerId,
    sourceOrigin: selectedOrigin,
    workspaceId: activeWorkspace?.id || null,
    additionalStartDate,
    additionalEndDate,
  }), [startDate, endDate, selectedPipelineId, selectedSellerId, selectedOrigin, activeWorkspace?.id, additionalStartDate, additionalEndDate]);

  const periodDays = useMemo(() => differenceInDays(endDate, startDate) + 1, [startDate, endDate]);
  const prevFilters: DashboardFilters = useMemo(() => ({
    ...filters,
    startDate: startOfDay(subDays(startDate, periodDays)),
    endDate: endOfDay(subDays(startDate, 1)),
    additionalStartDate: null,
    additionalEndDate: null,
  }), [filters, startDate, periodDays]);

  const { data, isLoading, error, refetch, cachedAt } = useGhlData(filters);
  const { data: prevData } = useGhlData(prevFilters);

  if (!activeWorkspace) {
    return <ErrorState error="Selecione uma conta para visualizar o dashboard." onRetry={() => window.location.reload()} />;
  }
  if (isLoading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState error={error} onRetry={() => refetch(true)} />;
  if (!data) return <ErrorState error="Sem dados. Clique em Atualizar agora para sincronizar com o GHL." onRetry={() => refetch(true)} />;

  const formatPercentage = (v: number) => `${v.toFixed(1)}%`;
  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
  const calcTrend = (cur: number, prev: number) => {
    if (prev === 0) return cur > 0 ? { value: 100, isPositive: true } : undefined;
    const ch = ((cur - prev) / prev) * 100;
    if (Math.abs(ch) < 0.1) return undefined;
    return { value: Math.round(Math.abs(ch) * 10) / 10, isPositive: ch > 0 };
  };

  const currentWon = data.funnelStages.find((s) => s.id === "venda_ganha")?.count || 0;
  const currentNeg =
    (data.funnelStages.find((s) => s.id === "proposta_enviada")?.count || 0) +
    (data.funnelStages.find((s) => s.id === "fechamento")?.count || 0);
  const prevWon = prevData?.funnelStages.find((s) => s.id === "venda_ganha")?.count || 0;
  const prevNeg = prevData
    ? (prevData.funnelStages.find((s) => s.id === "proposta_enviada")?.count || 0) +
      (prevData.funnelStages.find((s) => s.id === "fechamento")?.count || 0)
    : 0;

  const leadsTrend = prevData ? calcTrend(data.totalLeads, prevData.totalLeads) : undefined;
  const wonTrend = prevData ? calcTrend(currentWon, prevWon) : undefined;
  const negTrend = prevData ? calcTrend(currentNeg, prevNeg) : undefined;
  const convTrend = prevData ? calcTrend(data.conversionRates.overallConversion, prevData.conversionRates.overallConversion) : undefined;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">{activeWorkspace.name} · oportunidades GHL</p>
      </div>

      <Header
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        onRefresh={refetch}
        isLoading={isLoading}
        pipelines={data.pipelines}
        users={data.users}
        origins={data.origins}
        selectedPipelineId={selectedPipelineId}
        selectedSellerId={selectedSellerId}
        selectedOrigin={selectedOrigin}
        onPipelineChange={setSelectedPipelineId}
        onSellerChange={setSelectedSellerId}
        onOriginChange={setSelectedOrigin}
        cachedAt={cachedAt}
        additionalDateRange={additionalDateRange}
        onAdditionalDateRangeChange={setAdditionalDateRange}
        additionalDateLabel={data.additionalDateFieldName || null}
      />

      <AnimatedSection className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
        <MetricCard title="Total de Oportunidades" value={data.totalLeads} subtitle="no período selecionado" icon={Users} variant="default" tooltip="Quantidade total de oportunidades criadas no período filtrado." trend={leadsTrend} />
        <MetricCard title="Vendas Ganhas" value={currentWon} subtitle="no período" icon={Target} variant="success" tooltip="Oportunidades que chegaram à etapa de venda ganha no período." trend={wonTrend} />
        <MetricCard title="Em Negociação" value={currentNeg} subtitle="propostas + fechamento" icon={BarChart3} variant="accent" tooltip="Soma das oportunidades nas etapas de proposta e fechamento." trend={negTrend} />
        <MetricCard title="Taxa de Conversão" value={formatPercentage(data.conversionRates.overallConversion)} subtitle="do funil completo" icon={TrendingUp} variant="accent" tooltip="Percentual da primeira etapa até venda ganha." trend={convTrend} />
      </AnimatedSection>

      <AnimatedSection className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-5" delay={0.03}>
        <MetricCard
          title="Receita Ganha"
          value={formatCurrency(data.wonMonetary || 0)}
          subtitle={`${currentWon} ${currentWon === 1 ? "venda" : "vendas"} no período`}
          icon={DollarSign}
          variant="success"
          tooltip="Soma do valor monetário das oportunidades ganhas no período."
        />
        <MetricCard
          title="Ticket Médio"
          value={formatCurrency(currentWon > 0 ? (data.wonMonetary || 0) / currentWon : 0)}
          subtitle="por venda ganha"
          icon={Receipt}
          variant="accent"
          tooltip="Receita ganha dividida pelo número de vendas ganhas."
        />
      </AnimatedSection>

      <AnimatedSection className="grid grid-cols-1 gap-5 lg:gap-6" delay={0.05}>
        <FunnelVisualization
          funnelStages={data.funnelStages}
          conversionRates={data.conversionRates}
          lostLeads={data.lostLeads || 0}
          lostLeadsDetail={data.lostLeadsDetail || []}
        />
      </AnimatedSection>

      <AnimatedSection className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6" delay={0.05}>
        <LeadOrigins leadOrigins={data.origemDistribution} fillRate={data.origemFillRate} />
        <SalesOrigins
          wonOrigins={data.wonOrigemDistribution || []}
          fillRate={data.wonOrigemFillRate || 0}
          totalWon={data.funnelStages.find((s) => s.id === "venda_ganha")?.count || 0}
        />
      </AnimatedSection>

      <AnimatedSection className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6" delay={0.05}>
        <DataQuality customFields={data.customFields} overallFillRate={data.overallFillRate} />
        <LossReasons lossReasons={data.lossReasons || []} totalLost={data.lostLeads || 0} />
      </AnimatedSection>

      <AnimatedSection delay={0.05}>
        <DailyLeads dailyLeads={data.dailyLeads || []} />
      </AnimatedSection>

      <AnimatedSection delay={0.05}>
        <SellerPerformance sellers={data.sellers} />
      </AnimatedSection>

      <AnimatedSection className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6" delay={0.05}>
        <TimePerStage averageTimePerStage={data.averageTimePerStage} />
      </AnimatedSection>
    </div>
  );
}
