import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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

export function usePermissions() {
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
    (supabase.rpc as any)("get_my_permissions").then(({ data, error }: any) => {
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

  return { permissions, loading };
}
