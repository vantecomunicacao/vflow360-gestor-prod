import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

export interface Permissions {
  viewSuggestions: boolean;
  viewIntegrations: boolean;
  viewSettings: boolean;
  /** Ve os leads esfriando da conta inteira, e nao so os proprios. */
  viewAllCoolingLeads: boolean;
  isAdmin: boolean;
}

const DEFAULT: Permissions = {
  viewSuggestions: false,
  viewIntegrations: false,
  viewSettings: false,
  viewAllCoolingLeads: false,
  isAdmin: false,
};

interface PermissionsContextType {
  permissions: Permissions;
  loading: boolean;
}

const PermissionsContext = createContext<PermissionsContextType>({
  permissions: DEFAULT,
  loading: true,
});

export const usePermissions = () => useContext(PermissionsContext);

// Usuario restrito (vendedor/operacional): nao-admin, sem Integracoes nem
// Configuracoes, com acesso SO as telas que as permissoes dele liberam — nada
// de Dashboard, Analista IA, Conversas ou Documentacao. Basta uma das
// permissoes restritas para cair aqui; quem nao tem nenhuma segue como gestor,
// que era o comportamento antes de existir viewAllCoolingLeads.
export function isRestricted(p: Permissions): boolean {
  return !p.isAdmin && !p.viewIntegrations && !p.viewSettings
    && (p.viewSuggestions || p.viewAllCoolingLeads);
}

// Rota de destino conforme o perfil. Restrito vai para a tela que ele pode
// ver (Sugestoes tem prioridade quando tem as duas); demais, Dashboard.
export function landingPath(p: Permissions): string {
  if (!isRestricted(p)) return "/dashboard";
  return p.viewSuggestions ? "/suggestions" : "/cooling-leads";
}

export const PermissionsProvider = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const [permissions, setPermissions] = useState<Permissions>(DEFAULT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // Enquanto a sessao ainda esta sendo restaurada (reload), mantemos loading=true
    // para os guards nao avaliarem permissoes DEFAULT no intervalo user=null->presente
    // (senao um F5 em rota protegida chutaria o usuario para /dashboard).
    if (authLoading) {
      setLoading(true);
      return;
    }
    if (!user) {
      setPermissions(DEFAULT);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase.rpc("get_my_permissions").then(({ data, error }) => {
      if (!active) return;
      if (error || !data || !data[0]) {
        setPermissions(DEFAULT);
      } else {
        const r = data[0];
        setPermissions({
          viewSuggestions: !!r.view_suggestions,
          viewIntegrations: !!r.view_integrations,
          viewSettings: !!r.view_settings,
          viewAllCoolingLeads: !!r.view_all_cooling_leads,
          isAdmin: !!r.is_admin,
        });
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [user, authLoading]);

  const value = useMemo(() => ({ permissions, loading }), [permissions, loading]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
};
