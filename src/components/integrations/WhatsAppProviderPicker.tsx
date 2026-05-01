import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  creating: boolean;
  onToggle: () => void;
  onCreateUazap: () => void;
  onCreateStevo: () => void;
  onCreateStevoOficial: () => void;
}

export const WhatsAppProviderPicker = ({
  open,
  creating,
  onToggle,
  onCreateUazap,
  onCreateStevo,
  onCreateStevoOficial,
}: Props) => {
  return (
    <div className="relative">
      <Button size="sm" onClick={onToggle} disabled={creating}>
        {creating ? (
          <>
            <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Criando...
          </>
        ) : (
          <>
            <Plus className="w-4 h-4 mr-1" /> Adicionar número
          </>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-10 w-56">
          <button
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors rounded-t-lg"
            onClick={onCreateUazap}
          >
            <span className="font-medium text-foreground">Uazap</span>
            <p className="text-xs text-muted-foreground">Conexão via QR Code</p>
          </button>
          <button
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors border-t border-border"
            onClick={onCreateStevo}
          >
            <span className="font-medium text-foreground">Stevo</span>
            <p className="text-xs text-muted-foreground">Conexão via Webhook</p>
          </button>
          <button
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors rounded-b-lg border-t border-border"
            onClick={onCreateStevoOficial}
          >
            <span className="font-medium text-foreground">Stevo API Oficial</span>
            <p className="text-xs text-muted-foreground">Webhook WhatsApp Cloud API</p>
          </button>
        </div>
      )}
    </div>
  );
};
