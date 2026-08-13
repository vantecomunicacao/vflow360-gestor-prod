import { Navigate } from "react-router-dom";
import { usePermissions, landingPath } from "@/contexts/PermissionsContext";
import { Loader2 } from "lucide-react";

type PermKey = "viewSuggestions" | "viewIntegrations" | "viewSettings" | "viewAllCoolingLeads";

// `require` aceita uma lista: basta UMA das permissoes para liberar a rota.
const PermissionGuard = ({
  require,
  children,
}: {
  require: PermKey | PermKey[];
  children: React.ReactNode;
}) => {
  const { permissions, loading } = usePermissions();
  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const allowed = Array.isArray(require)
    ? require.some((k) => permissions[k])
    : permissions[require];
  if (!allowed) {
    return <Navigate to={landingPath(permissions)} replace />;
  }
  return <>{children}</>;
};

export default PermissionGuard;
