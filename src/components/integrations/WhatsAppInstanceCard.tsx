import {
  CheckCircle,
  Clock,
  Copy,
  Loader2,
  MessageSquare,
  Pencil,
  RefreshCw,
  Trash2,
  WifiOff,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GhlUserOption, WhatsAppInstance, WhatsAppStatus } from "./types";

interface Props {
  inst: WhatsAppInstance;
  editingLabel: string | null;
  editLabelValue: string;
  setEditingLabel: (id: string | null) => void;
  setEditLabelValue: (v: string) => void;
  onRename: (inst: WhatsAppInstance) => void;
  onDelete: (inst: WhatsAppInstance) => void;
  onReconnect: (inst: WhatsAppInstance) => void;
  onDisconnect: (inst: WhatsAppInstance) => void;
  onCopy: (text: string) => void;
  onSaveAccessToken: (inst: WhatsAppInstance, token: string) => void;
}

const statusBadge = (status: WhatsAppStatus) => {
  switch (status) {
    case "connected":
      return (
        <Badge variant="outline" className="text-success border-success/30">
          <CheckCircle className="w-3 h-3 mr-1" /> Conectado
        </Badge>
      );
    case "connecting":
      return (
        <Badge variant="outline" className="text-warning border-warning/30">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Conectando
        </Badge>
      );
    case "disconnected":
      return (
        <Badge variant="outline" className="text-destructive border-destructive/30">
          <WifiOff className="w-3 h-3 mr-1" /> Desconectado
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground border-border">
          <XCircle className="w-3 h-3 mr-1" /> Não configurado
        </Badge>
      );
  }
};

const providerLabel = (p: WhatsAppInstance["provider"]) =>
  p === "uazap" ? "Uazap" : p === "stevo" ? "Stevo" : "Stevo Oficial";

export const WhatsAppInstanceCard = ({
  inst,
  editingLabel,
  editLabelValue,
  setEditingLabel,
  setEditLabelValue,
  onRename,
  onDelete,
  onReconnect,
  onDisconnect,
  onCopy,
  onSaveAccessToken,
}: Props) => {
  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-success" />
          {editingLabel === inst.id ? (
            <Input
              className="h-7 w-40 text-sm"
              value={editLabelValue}
              onChange={(e) => setEditLabelValue(e.target.value)}
              onBlur={() => onRename(inst)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRename(inst);
                if (e.key === "Escape") setEditingLabel(null);
              }}
              autoFocus
            />
          ) : (
            <>
              <span className="text-sm font-medium text-foreground">{inst.label}</span>
              <button
                className="text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => {
                  setEditingLabel(inst.id);
                  setEditLabelValue(inst.label);
                }}
              >
                <Pencil className="w-3 h-3" />
              </button>
            </>
          )}
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
            {providerLabel(inst.provider)}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {inst.provider === "uazap" && statusBadge(inst.status)}
          {(inst.provider === "stevo" || inst.provider === "stevo_oficial") &&
            (inst.lastWebhookAt ? (
              <Badge variant="outline" className="text-success border-success/30">
                <CheckCircle className="w-3 h-3 mr-1" /> Ativo
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground border-border">
                <Clock className="w-3 h-3 mr-1" /> Aguardando
              </Badge>
            ))}
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
            onClick={() => onDelete(inst)}
            disabled={inst.loading}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Uazap-specific UI */}
      {inst.provider === "uazap" && inst.status === "connecting" && (
        <div className="bg-muted rounded-lg p-4 flex flex-col items-center gap-3">
          {inst.qrCode ? (
            <>
              <div className="w-52 h-52 bg-background rounded-lg flex items-center justify-center overflow-hidden border border-border">
                <img
                  src={inst.qrCode.startsWith("data:") ? inst.qrCode : `data:image/png;base64,${inst.qrCode}`}
                  alt="QR Code"
                  className="w-full h-full object-contain"
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">Escaneie o QR Code com seu WhatsApp</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Aguardando conexão...
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Gerando QR Code...</p>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => onReconnect(inst)} disabled={inst.loading}>
            <RefreshCw className="w-3 h-3 mr-1" /> Novo QR Code
          </Button>
        </div>
      )}

      {inst.provider === "uazap" && inst.status === "disconnected" && (
        <div className="bg-muted rounded-lg p-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Instância desconectada</p>
          <Button size="sm" variant="outline" onClick={() => onReconnect(inst)} disabled={inst.loading}>
            {inst.loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            Reconectar
          </Button>
        </div>
      )}

      {inst.provider === "uazap" && inst.status === "connected" && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onReconnect(inst)} disabled={inst.loading}>
            <RefreshCw className="w-3 h-3 mr-1" /> Reconectar
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDisconnect(inst)} disabled={inst.loading}>
            Desconectar
          </Button>
        </div>
      )}

      {/* Stevo-specific UI */}
      {inst.provider === "stevo" && inst.webhookUrl && (
        <div className="space-y-3">
          <div className="bg-muted rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1.5">Webhook URL — cole no Stevo:</p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-background border border-border rounded px-2 py-1 flex-1 truncate text-foreground">
                {inst.webhookUrl}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 shrink-0"
                onClick={() => onCopy(inst.webhookUrl!)}
              >
                <Copy className="w-3 h-3 mr-1" /> Copiar
              </Button>
            </div>
          </div>
          {inst.lastWebhookAt && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Último webhook recebido: {new Date(inst.lastWebhookAt).toLocaleString("pt-BR")}
            </p>
          )}
        </div>
      )}

      {/* Stevo Oficial-specific UI */}
      {inst.provider === "stevo_oficial" && inst.webhookUrl && (
        <div className="space-y-3">
          <div className="bg-muted rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1.5">Webhook URL — cole no Stevo API Oficial:</p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-background border border-border rounded px-2 py-1 flex-1 truncate text-foreground">
                {inst.webhookUrl}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 shrink-0"
                onClick={() => onCopy(inst.webhookUrl!)}
              >
                <Copy className="w-3 h-3 mr-1" /> Copiar
              </Button>
            </div>
          </div>

          <div className="bg-muted rounded-lg p-3 space-y-2">
            <Label className="text-xs">Access Token (opcional — necessário para baixar mídias)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="password"
                placeholder="EAAJxxx..."
                defaultValue={inst.accessToken || ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== inst.accessToken) onSaveAccessToken(inst, v);
                }}
                className="h-8 text-xs"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Token da WhatsApp Cloud API. Sem ele, áudios/imagens entram como placeholder.
            </p>
          </div>

          {inst.lastWebhookAt && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Último webhook recebido: {new Date(inst.lastWebhookAt).toLocaleString("pt-BR")}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
