import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Pipeline, User } from "@/hooks/useGhlData";

export interface GhlFilterOptions {
  pipelines: Pipeline[];
  users: User[];
}

/** Funis e vendedores da conta, direto das tabelas (RLS libera para membros).
 *  Usado por telas que precisam dos filtros sem pagar o custo do `ghl-dashboard`. */
export function useGhlFilterOptions(workspaceId: string | null) {
  return useQuery<GhlFilterOptions, Error>({
    queryKey: ["ghl-filter-options", workspaceId],
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [{ data: pipes, error: pErr }, { data: users, error: uErr }] = await Promise.all([
        supabase.from("ghl_pipelines").select("ghl_id,name").eq("workspace_id", workspaceId!).order("name"),
        supabase.from("ghl_users").select("ghl_id,name").eq("workspace_id", workspaceId!).order("name"),
      ]);
      if (pErr) throw new Error(pErr.message);
      if (uErr) throw new Error(uErr.message);
      return {
        pipelines: (pipes || []).map((p) => ({ id: p.ghl_id, name: p.name })),
        users: (users || []).map((u) => ({ id: u.ghl_id, name: u.name })),
      };
    },
  });
}
