import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CustomField, Pipeline, ResponseTime } from "@/hooks/useGhlData";
import { extractFunctionError } from "@/lib/edge-function-error";

export interface IncompleteLead {
  id: string;
  name: string;
  stage: string | null;
  status: "open" | "won" | "lost";
  /** Nomes dos campos que estão vazios nesta oportunidade. */
  missing: string[];
  createdAt: string | null;
}

export interface MyPerformanceData {
  scope: "seller";
  sellerName: string | null;
  pipelines: Pipeline[];
  totalLeads: number;
  customFields: CustomField[];
  overallFillRate: number;
  /** Até 300 leads; o total real vem em incompleteLeadsTotal. */
  incompleteLeads: IncompleteLead[];
  incompleteLeadsTotal: number;
  responseTime: ResponseTime;
  ghlLocationId: string | null;
  cachedAt: string;
}

export interface MyPerformanceFilters {
  workspaceId: string | null;
  startDate: Date;
  endDate: Date;
  pipelineId: string | null;
  stageIds: string[];
}

/** Busca a tela "Meu desempenho" no `ghl-dashboard` em modo
 *  view="my_performance": mesmo cálculo do Dashboard, com o vendedor forçado no
 *  servidor ao vínculo do usuário (user_ghl_links) e só os blocos da tela. */
export function useMyPerformance(filters: MyPerformanceFilters, options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  return useQuery<MyPerformanceData, Error>({
    queryKey: [
      "my-performance",
      filters.workspaceId,
      filters.startDate.toISOString(),
      filters.endDate.toISOString(),
      filters.pipelineId,
      [...filters.stageIds].sort().join(","),
    ],
    enabled: enabled && !!filters.workspaceId,
    placeholderData: keepPreviousData,
    // Sem permissão ou sem vínculo não adianta tentar de novo.
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ghl-dashboard", {
        body: {
          view: "my_performance",
          workspace_id: filters.workspaceId,
          startDate: filters.startDate.toISOString(),
          endDate: filters.endDate.toISOString(),
          pipelineId: filters.pipelineId,
          stageIds: filters.stageIds,
        },
      });
      if (error) throw new Error(await extractFunctionError(error));
      const errMaybe = (data as { error?: string } | null)?.error;
      if (errMaybe) throw new Error(errMaybe);
      return data as MyPerformanceData;
    },
  });
}
