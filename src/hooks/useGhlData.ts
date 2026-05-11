import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface StageLead { id: number; name: string; }
export interface FunnelStage { id: string; name: string; count: number; currentCount?: number; leads?: StageLead[]; }
export interface Seller {
  name: string;
  contatoInicial: number;
  propostaEnviada: number;
  fechamento: number;
  vendaGanha: number;
}
export interface LeadOrigin { name: string; count: number; percentage: number; }
export interface CustomField {
  name: string;
  filledPercentage: number;
  emptyPercentage: number;
  totalLeads: number;
  filledCount: number;
}
export interface ConversionRates {
  contatoToProsposta: number;
  propostaToFechamento: number;
  fechamentoToVenda: number;
  overallConversion: number;
}
export interface AverageTimePerStage {
  contatoInicial: number;
  propostaEnviada: number;
  fechamento: number;
}
export interface PipelineStage { id: string; name: string; }
export interface Pipeline { id: string; name: string; stages?: PipelineStage[]; }
export interface User { id: string; name: string; }
export interface DailyLead { date: string; count: number; dayName: string; }
export interface LossReason { reason: string; count: number; }
export interface CustomFieldDistribution {
  key: string;
  name: string;
  totalLeads: number;
  filledCount: number;
  distribution: { name: string; count: number; percentage: number }[];
}
export interface ResponseTime {
  averageMinutes: number;
  responseCount: number;
  conversationsAnalyzed: number;
  businessHoursStart: string;
  businessHoursEnd: string;
}

export interface DashboardData {
  totalLeads: number;
  lostLeads: number;
  lostLeadsDetail?: StageLead[];
  funnelStages: FunnelStage[];
  conversionRates: ConversionRates;
  sellers: Seller[];
  leadOrigins: LeadOrigin[];
  origemDistribution: LeadOrigin[];
  origemFillRate: number;
  wonOrigemDistribution: LeadOrigin[];
  wonOrigemFillRate: number;
  customFields: CustomField[];
  customFieldDistributions?: CustomFieldDistribution[];
  averageTimePerStage: AverageTimePerStage;
  dailyLeads: DailyLead[];
  pipelines: Pipeline[];
  users: User[];
  origins: string[];
  overallFillRate: number;
  lossReasons: LossReason[];
  totalMonetary?: number;
  wonMonetary?: number;
  cachedAt?: string;
  additionalDateFieldId?: string | null;
  additionalDateFieldName?: string | null;
  responseTime?: ResponseTime | null;
}

export interface DashboardFilters {
  startDate: Date;
  endDate: Date;
  pipelineId: string | null;
  stageId: string | null;
  sellerId: string | null;
  sourceOrigin: string | null;
  workspaceId: string | null;
  additionalStartDate?: Date | null;
  additionalEndDate?: Date | null;
}

interface UseGhlDataReturn {
  data: DashboardData | null;
  isLoading: boolean;
  error: string | null;
  refetch: (forceRefresh?: boolean) => Promise<void>;
  cachedAt: string | null;
}

export function useGhlData(filters: DashboardFilters): UseGhlDataReturn {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!filters.workspaceId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      if (forceRefresh) {
        // Cooldown client-side de 2min para sync manual por workspace
        const ckey = `ghl-sync-last:${filters.workspaceId}`;
        const lastStr = localStorage.getItem(ckey);
        const last = lastStr ? Number(lastStr) : 0;
        const elapsed = Date.now() - last;
        const COOLDOWN = 2 * 60 * 1000;
        if (last && elapsed < COOLDOWN) {
          const wait = Math.ceil((COOLDOWN - elapsed) / 1000);
          toast({
            title: "Aguarde para sincronizar novamente",
            description: `Você pode sincronizar novamente em ${wait}s.`,
          });
          setIsLoading(false);
          return;
        }
        localStorage.setItem(ckey, String(Date.now()));

        const { data: syncData, error: syncError } = await supabase.functions.invoke("ghl-sync", {
          body: { workspace_id: filters.workspaceId },
        });
        const syncErrMsg = (syncData as any)?.error;
        if (syncErrMsg) {
          toast({ title: "Sincronização", description: syncErrMsg });
        } else if (syncError) {
          console.warn("Sync warning:", syncError.message);
        }
      }

      const { data: responseData, error: functionError } = await supabase.functions.invoke("ghl-dashboard", {
        body: {
          workspace_id: filters.workspaceId,
          startDate: filters.startDate.toISOString(),
          endDate: filters.endDate.toISOString(),
          pipelineId: filters.pipelineId,
          stageId: filters.stageId,
          sellerId: filters.sellerId,
          sourceOrigin: filters.sourceOrigin,
          additionalStartDate: filters.additionalStartDate ? filters.additionalStartDate.toISOString() : null,
          additionalEndDate: filters.additionalEndDate ? filters.additionalEndDate.toISOString() : null,
        },
      });

      if (functionError) throw new Error(functionError.message);
      if ((responseData as any)?.error) throw new Error((responseData as any).error);

      setData(responseData as DashboardData);
      setCachedAt((responseData as any)?.cachedAt || null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setError(msg);
      toast({ title: "Erro ao carregar dashboard", description: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.startDate.getTime(), filters.endDate.getTime(),
    filters.pipelineId, filters.stageId, filters.sellerId, filters.sourceOrigin, filters.workspaceId,
    filters.additionalStartDate?.getTime(), filters.additionalEndDate?.getTime(),
  ]);

  useEffect(() => {
    const t = setTimeout(() => fetchData(), 200);
    return () => clearTimeout(t);
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData, cachedAt };
}
