import { Navigate } from "react-router-dom";
import { usePermissions, isRestricted, landingPath } from "@/contexts/PermissionsContext";
import { Loader2 } from "lucide-react";

// Bloqueia usuarios restritos (vendedor/operacional) das rotas de gestor,
// redirecionando para a tela que eles podem ver. Gestores/admins passam.
const GestorGuard = ({ children }: { children: React.ReactNode }) => {
  const { permissions, loading } = usePermissions();
  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isRestricted(permissions)) {
    return <Navigate to={landingPath(permissions)} replace />;
  }
  return <>{children}</>;
};

export default GestorGuard;
