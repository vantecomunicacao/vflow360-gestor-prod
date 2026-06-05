import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

export interface Permissions {
  viewSuggestions: boolean;
  viewIntegrations: boolean;
  viewSettings: boolean;
  isAdmin: boolean;
}

const DEFAULT: Permissions = {
  viewSuggestions: false,
  viewIntegrations: false,
  viewSettings: false,
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

// Usuario "so sugestoes" (vendedor): nao-admin, ve sugestoes e nada mais.
export function isSuggestionsOnly(p: Permissions): boolean {
  return !p.isAdmin && p.viewSuggestions && !p.viewIntegrations && !p.viewSettings;
}

// Rota de destino conforme o perfil: vendedor -> Sugestoes; demais -> Dashboard.
export function landingPath(p: Permissions): string {
  return isSuggestionsOnly(p) ? "/suggestions" : "/dashboard";
}

export const PermissionsProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<Permissions>(DEFAULT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
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
          isAdmin: !!r.is_admin,
        });
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [user]);

  const value = useMemo(() => ({ permissions, loading }), [permissions, loading]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
};
