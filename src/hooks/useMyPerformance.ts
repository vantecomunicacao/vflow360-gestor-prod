import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CustomField, Pipeline, ResponseTime, User } from "@/hooks/useGhlData";
import { extractFunctionError } from "@/lib/edge-function-error";

export interface IncompleteLead {
  id: string;
  name: string;
  stage: string | null;
  /** Vendedor responsável (útil quando a tela mostra mais de um). */
  seller: string | null;
  status: "open" | "won" | "lost";
  /** Nomes dos campos que estão vazios nesta oportunidade. */
  missing: string[];
  createdAt: string | null;
}

export interface MyPerformanceData {
  scope: "seller";
  /** true = usuário vinculado a um vendedor do GHL: a tela fica travada nele. */
  sellerLocked: boolean;
  /** Opções do filtro de vendedor (travado: só ele; sem vínculo: todos). */
  users: User[];
  /** Nome quando a tela é de um vendedor só; null com vários/todos. */
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
  /** Ignorado pelo servidor quando o usuário tem vínculo com o GHL. */
  sellerIds: string[];
}

/** Busca a tela "Meu desempenho" no `ghl-dashboard` em modo
 *  view="my_performance": mesmo cálculo do Dashboard, só com os blocos da tela.
 *  Com vínculo (user_ghl_links) o servidor força o vendedor do usuário; sem
 *  vínculo (login compartilhado) vale o vendedor escolhido no filtro. */
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
      [...filters.sellerIds].sort().join(","),
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
          sellerIds: filters.sellerIds,
        },
      });
      if (error) throw new Error(await extractFunctionError(error));
      const errMaybe = (data as { error?: string } | null)?.error;
      if (errMaybe) throw new Error(errMaybe);
      return data as MyPerformanceData;
    },
  });
}
