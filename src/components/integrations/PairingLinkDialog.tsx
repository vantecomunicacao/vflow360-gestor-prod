import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, ExternalLink, Link2, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { callEdge } from "@/lib/edgeClient";
import { supabase } from "@/integrations/supabase/client";
import { WhatsAppInstance } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: WhatsAppInstance | null;
}

interface PairingLink {
  token_id: string;
  token_prefix: string;
  created_at: string;
  last_paired_at: string | null;
  use_count: number;
  url: string | null;
  is_existing: boolean;
}

const formatDateTime = (iso: string | null) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return null;
  }
};

export const PairingLinkDialog = ({ open, onOpenChange, integration }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<null | "rotate" | "revoke">(null);
  const [link, setLink] = useState<PairingLink | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchLink = useCallback(async (integrationId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await callEdge<PairingLink>("evolution-manage", {
        action: "get_or_create_pairing_link",
        integration_id: integrationId,
      });
      setLink(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar link");
    } finally {
      setLoading(false);
    }
  }, []);

  // Carrega/cria link ao abrir
  useEffect(() => {
    if (!open || !integration) {
      setLink(null);
      setError(null);
      return;
    }
    fetchLink(integration.id);
  }, [open, integration, fetchLink]);

  // Realtime: detecta last_paired_at atualizado pela edge pública
  useEffect(() => {
    if (!link?.token_id) return;
    const channel = supabase
      .channel(`pairing-token-${link.token_id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "integration_pairing_tokens",
          filter: `id=eq.${link.token_id}`,
        },
        (payload) => {
          const row = payload.new as { last_paired_at: string | null; use_count: number };
          setLink((prev) =>
            prev
              ? { ...prev, last_paired_at: row.last_paired_at, use_count: row.use_count }
              : prev,
          );
          if (row.last_paired_at && !link.last_paired_at) {
            toast({ title: "Cliente conectou!", description: "O WhatsApp foi pareado com sucesso." });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [link?.token_id, link?.last_paired_at, toast]);

  const handleCopy = () => {
    if (!link?.url) return;
    navigator.clipboard.writeText(link.url);
    toast({ title: "Link copiado!" });
  };

  const handleRotate = async () => {
    if (!integration) return;
    if (!confirm("Gerar um novo link invalida o link atual. Continuar?")) return;
    setActionLoading("rotate");
    try {
      const data = await callEdge<PairingLink>("evolution-manage", {
        action: "rotate_pairing_link",
        integration_id: integration.id,
      });
      setLink(data);
      toast({ title: "Novo link gerado!" });
    } catch (e) {
      toast({
        title: "Erro",
        description: e instanceof Error ? e.message : "Erro ao rotacionar link",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevoke = async () => {
    if (!link?.token_id) return;
    if (!confirm("Revogar o link impede que o cliente reconecte. Tem certeza?")) return;
    setActionLoading("revoke");
    try {
      await callEdge("evolution-manage", {
        action: "revoke_pairing_link",
        token_id: link.token_id,
      });
      setLink(null);
      toast({ title: "Link revogado" });
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Erro",
        description: e instanceof Error ? e.message : "Erro ao revogar link",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            Link de pareamento
          </DialogTitle>
          <DialogDescription>
            {integration?.label
              ? `Envie este link para o cliente conectar o WhatsApp da conta "${integration.label}".`
              : "Envie este link para o cliente conectar o WhatsApp."}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {!loading && error && (
          <div className="bg-destructive/10 text-destructive text-sm rounded-lg p-3">{error}</div>
        )}

        {!loading && !error && link && (
          <div className="space-y-4">
            {link.url ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input value={link.url} readOnly className="text-xs font-mono" />
                  <Button size="icon" variant="outline" onClick={handleCopy} className="shrink-0">
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="outline" asChild className="shrink-0">
                    <a href={link.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  ⚠️ Salve este link agora — depois de fechar, só será possível ver o prefixo.
                </p>
              </div>
            ) : (
              <div className="bg-muted rounded-lg p-3 space-y-2">
                <p className="text-sm text-foreground">
                  Já existe um link ativo (prefixo <code className="text-xs bg-background px-1.5 py-0.5 rounded">{link.token_prefix}…</code>).
                </p>
                <p className="text-xs text-muted-foreground">
                  Se você perdeu o link, clique em <strong>Gerar novo link</strong> para criar outro (o atual será invalidado).
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-muted rounded-lg p-3">
                <p className="text-muted-foreground">Acessos</p>
                <p className="text-base font-semibold text-foreground">{link.use_count}</p>
              </div>
              <div className="bg-muted rounded-lg p-3">
                <p className="text-muted-foreground">Último pareamento</p>
                <p className="text-sm font-medium text-foreground">
                  {link.last_paired_at ? (
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-success" />
                      {formatDateTime(link.last_paired_at)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Ainda não usado</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRotate}
                disabled={actionLoading !== null}
                className="flex-1"
              >
                {actionLoading === "rotate" ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="w-3 h-3 mr-1" />
                )}
                Gerar novo link
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRevoke}
                disabled={actionLoading !== null}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {actionLoading === "revoke" ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : (
                  <Trash2 className="w-3 h-3 mr-1" />
                )}
                Revogar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};