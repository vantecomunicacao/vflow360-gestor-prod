import { Loader2 } from "lucide-react";

export function LoadingState() {
  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">Carregando dados do VFlow360...</h2>
          <p className="text-sm text-muted-foreground">Agregando oportunidades, pipelines e vendedores</p>
        </div>
      </div>
    </div>
  );
}
