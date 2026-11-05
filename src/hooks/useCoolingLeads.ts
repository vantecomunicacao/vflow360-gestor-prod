import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CoolingLeads } from "@/hooks/useGhlData";
import { extractFunctionError } from "@/lib/edge-function-error";

export interface CoolingLeadsResult extends CoolingLeads {
  scope?: "seller" | "workspace";
}

export interface CoolingLeadsFilters {
  pipelineId?: string | null;
  sellerIds?: string[];
}

/** Busca os leads esfriando via a edge function dedicada `ghl-cooling-leads`.
 *  O escopo (vendedor vs. workspace) é decidido no servidor: para quem tem
 *  vínculo em user_ghl_links o filtro de vendedor é ignorado e forçado ao dele. */
export function useCoolingLeads(workspaceId: string | null, filters: CoolingLeadsFilters = {}) {
  const pipelineId = filters.pipelineId ?? null;
  const sellerIds = filters.sellerIds ?? [];
  return useQuery<CoolingLeadsResult, Error>({
    queryKey: ["cooling-leads", workspaceId, pipelineId, [...sellerIds].sort().join(",")],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ghl-cooling-leads", {
        body: { workspace_id: workspaceId, pipelineId, sellerIds },
      });
      // Em resposta não-2xx o supabase-js só entrega "non-2xx status code": o
      // motivo de verdade está no corpo, que fica pendurado em error.context.
      if (error) throw new Error(await extractFunctionError(error));
      const errMaybe = (data as { error?: string } | null)?.error;
      if (errMaybe) throw new Error(errMaybe);
      return data as CoolingLeadsResult;
    },
  });
}
