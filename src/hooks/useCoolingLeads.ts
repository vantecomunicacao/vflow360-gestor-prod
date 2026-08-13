import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CoolingLeads } from "@/hooks/useGhlData";

export interface CoolingLeadsResult extends CoolingLeads {
  scope?: "seller" | "workspace";
}

export interface CoolingLeadsFilters {
  pipelineId?: string | null;
  sellerIds?: string[];
}

/** Mensagens amigáveis para os erros que a function devolve por status. */
const FRIENDLY_ERROR: Record<string, string> = {
  Forbidden: "Você não tem acesso a esta conta.",
  Unauthorized: "Sessão expirada. Entre novamente.",
  "Missing authorization": "Sessão expirada. Entre novamente.",
};

/** Lê o corpo JSON de uma resposta de erro da edge function para recuperar a
 *  mensagem real (o supabase-js só expõe "non-2xx status code"). */
async function extractFunctionError(error: Error & { context?: unknown }): Promise<string> {
  const res = error.context;
  if (res instanceof Response) {
    try {
      const body = await res.clone().json();
      const raw = (body as { error?: string })?.error;
      if (raw) return FRIENDLY_ERROR[raw] || raw;
    } catch {
      // corpo vazio ou não-JSON: fica com a mensagem original
    }
  }
  return error.message;
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
