import { MessageSquare, Link2, QrCode, CheckCircle, XCircle, RefreshCw, Settings, Plus, Trash2, Sparkles, Loader2, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface CustomFieldMapping {
  id: string;
  ghlFieldName: string;
  description: string;
}

interface PipelineStageMapping {
  id: string;
  stageName: string;
  description: string;
}

type WhatsAppStatus = "not_created" | "disconnected" | "connecting" | "connected";

const Integrations = () => {
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatus>("not_created");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loadingWa, setLoadingWa] = useState(false);
  const [ghlConnected, setGhlConnected] = useState(false);
  const [ghlLocationName, setGhlLocationName] = useState("");
  const [loadingGhl, setLoadingGhl] = useState(false);
  const [ghlApiKey, setGhlApiKey] = useState("");
  const [ghlLocationId, setGhlLocationId] = useState("");
  const [customFields, setCustomFields] = useState<CustomFieldMapping[]>([
    { id: "1", ghlFieldName: "", description: "" },
  ]);
  const [pipelineStages, setPipelineStages] = useState<PipelineStageMapping[]>([
    { id: "1", stageName: "", description: "" },
  ]);
  const [aiPrompt, setAiPrompt] = useState(
    "Você é um assistente de CRM. Ao analisar conversas, leve em conta os campos personalizados e etapas do funil mapeados abaixo para gerar sugestões precisas."
  );
  const { toast } = useToast();

  const callUazap = useCallback(async (action: string, extra?: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/uazap-manage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action, ...extra }),
      }
    );
    const result = await response.json();
    if (!result.success) throw new Error(result.error || "Unknown error");
    return result.data;
  }, []);

  const callGhl = useCallback(async (action: string, extra?: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ghl-manage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action, ...extra }),
      }
    );
    const result = await response.json();
    if (!result.success) throw new Error(result.error || "Unknown error");
    return result.data;
  }, []);

  // Check WhatsApp + GHL status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const data = await callUazap("status");
        const status = data?.status || "not_created";
        setWhatsappStatus(status === "connected" ? "connected" : status === "connecting" ? "connecting" : status === "not_created" ? "not_created" : "disconnected");
      } catch { /* silent */ }

      try {
        const data = await callGhl("status");
        if (data?.status === "connected") {
          setGhlConnected(true);
          setGhlLocationName(data.locationName || "");
        }
      } catch { /* silent */ }
    };
    checkStatus();
  }, [callUazap, callGhl]);

  // Poll for status while connecting
  useEffect(() => {
    if (whatsappStatus !== "connecting") return;
    const interval = setInterval(async () => {
      try {
        const data = await callUazap("status");
        if (data?.status === "connected") {
          setWhatsappStatus("connected");
          setQrCode(null);
          toast({ title: "WhatsApp conectado com sucesso!" });
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [whatsappStatus, callUazap, toast]);

  const handleCreateAndConnect = async () => {
    setLoadingWa(true);
    try {
      // Create instance
      await callUazap("create");
      toast({ title: "Instância criada!", description: "Gerando QR Code..." });

      // Get QR code
      const connectData = await callUazap("connect");
      if (connectData?.qrcode || connectData?.base64 || connectData?.pairingCode) {
        setQrCode(connectData.qrcode || connectData.base64 || null);
        setWhatsappStatus("connecting");
      } else {
        // Try qrcode endpoint
        const qrData = await callUazap("qrcode");
        setQrCode(qrData?.qrcode || qrData?.base64 || null);
        setWhatsappStatus("connecting");
      }
    } catch (error) {
      toast({ title: "Erro", description: error instanceof Error ? error.message : "Erro ao conectar", variant: "destructive" });
    } finally {
      setLoadingWa(false);
    }
  };

  const handleReconnect = async () => {
    setLoadingWa(true);
    try {
      const connectData = await callUazap("connect");
      if (connectData?.qrcode || connectData?.base64) {
        setQrCode(connectData.qrcode || connectData.base64);
        setWhatsappStatus("connecting");
      } else {
        const qrData = await callUazap("qrcode");
        setQrCode(qrData?.qrcode || qrData?.base64 || null);
        setWhatsappStatus("connecting");
      }
    } catch (error) {
      toast({ title: "Erro", description: error instanceof Error ? error.message : "Erro ao reconectar", variant: "destructive" });
    } finally {
      setLoadingWa(false);
    }
  };

  const handleDisconnect = async () => {
    setLoadingWa(true);
    try {
      await callUazap("disconnect");
      setWhatsappStatus("disconnected");
      setQrCode(null);
      toast({ title: "WhatsApp desconectado" });
    } catch (error) {
      toast({ title: "Erro", description: error instanceof Error ? error.message : "Erro ao desconectar", variant: "destructive" });
    } finally {
      setLoadingWa(false);
    }
  };

  const addCustomField = () => setCustomFields(prev => [...prev, { id: crypto.randomUUID(), ghlFieldName: "", description: "" }]);
  const removeCustomField = (id: string) => setCustomFields(prev => prev.filter(f => f.id !== id));
  const updateCustomField = (id: string, key: keyof CustomFieldMapping, value: string) => setCustomFields(prev => prev.map(f => f.id === id ? { ...f, [key]: value } : f));
  const addPipelineStage = () => setPipelineStages(prev => [...prev, { id: crypto.randomUUID(), stageName: "", description: "" }]);
  const removePipelineStage = (id: string) => setPipelineStages(prev => prev.filter(s => s.id !== id));
  const updatePipelineStage = (id: string, key: keyof PipelineStageMapping, value: string) => setPipelineStages(prev => prev.map(s => s.id === id ? { ...s, [key]: value } : s));

  const handleSaveMappings = () => {
    toast({ title: "Mapeamento salvo!", description: "A IA usará essas informações para gerar sugestões mais precisas." });
  };

  const getWhatsAppBadge = () => {
    switch (whatsappStatus) {
      case "connected":
        return <Badge variant="outline" className="text-success border-success/30"><CheckCircle className="w-3 h-3 mr-1" /> Conectado</Badge>;
      case "connecting":
        return <Badge variant="outline" className="text-warning border-warning/30"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Conectando</Badge>;
      case "disconnected":
        return <Badge variant="outline" className="text-destructive border-destructive/30"><WifiOff className="w-3 h-3 mr-1" /> Desconectado</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground border-border"><XCircle className="w-3 h-3 mr-1" /> Não configurado</Badge>;
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integrações</h1>
        <p className="text-muted-foreground">Gerencie suas conexões com WhatsApp e Go High Level</p>
      </div>

      {/* WhatsApp */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-success" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">WhatsApp (Uazap)</h3>
              <p className="text-sm text-muted-foreground">Conexão via QR Code</p>
            </div>
          </div>
          {getWhatsAppBadge()}
        </div>

        {whatsappStatus === "not_created" && (
          <div className="bg-muted rounded-lg p-6 flex flex-col items-center gap-4">
            <Wifi className="w-12 h-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              Conecte seu WhatsApp para começar a receber e analisar mensagens automaticamente.
            </p>
            <Button onClick={handleCreateAndConnect} disabled={loadingWa}>
              {loadingWa ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Criando...</> : <><MessageSquare className="w-4 h-4 mr-2" /> Conectar WhatsApp</>}
            </Button>
          </div>
        )}

        {whatsappStatus === "connecting" && (
          <div className="bg-muted rounded-lg p-6 flex flex-col items-center gap-4">
            {qrCode ? (
              <>
                <div className="w-64 h-64 bg-background rounded-lg flex items-center justify-center overflow-hidden border border-border">
                  <img
                    src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                    alt="QR Code WhatsApp"
                    className="w-full h-full object-contain"
                  />
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  Escaneie o QR Code com seu WhatsApp para conectar
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Aguardando conexão...
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleReconnect} disabled={loadingWa}>
              <RefreshCw className="w-4 h-4 mr-1" /> Gerar novo QR Code
            </Button>
          </div>
        )}

        {whatsappStatus === "disconnected" && (
          <div className="bg-muted rounded-lg p-6 flex flex-col items-center gap-4">
            <WifiOff className="w-12 h-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              Sua instância está desconectada. Reconecte para continuar recebendo mensagens.
            </p>
            <Button onClick={handleReconnect} disabled={loadingWa}>
              {loadingWa ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Reconectando...</> : <><RefreshCw className="w-4 h-4 mr-2" /> Reconectar</>}
            </Button>
          </div>
        )}

        {whatsappStatus === "connected" && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReconnect} disabled={loadingWa}>
              <RefreshCw className="w-4 h-4 mr-1" /> Reconectar
            </Button>
            <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={loadingWa}>
              Desconectar
            </Button>
          </div>
        )}
      </motion.div>

      {/* GHL */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
              <Link2 className="w-5 h-5 text-info" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Go High Level</h3>
              <p className="text-sm text-muted-foreground">Integração com CRM</p>
            </div>
          </div>
          <Badge variant="outline" className={ghlConnected ? "text-success border-success/30" : "text-destructive border-destructive/30"}>
            {ghlConnected ? <><CheckCircle className="w-3 h-3 mr-1" /> Conectado</> : <><XCircle className="w-3 h-3 mr-1" /> Desconectado</>}
          </Badge>
        </div>

        {!ghlConnected ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input placeholder="Sua API Key do GHL" value={ghlApiKey} onChange={(e) => setGhlApiKey(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Location ID</Label>
              <Input placeholder="Seu Location ID" value={ghlLocationId} onChange={(e) => setGhlLocationId(e.target.value)} />
            </div>
            <Button onClick={() => { setGhlConnected(true); toast({ title: "GHL conectado!" }); }}>
              <Link2 className="w-4 h-4 mr-1" /> Conectar
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-1" /> Configurações
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setGhlConnected(false); toast({ title: "GHL desconectado" }); }}>
                Desconectar
              </Button>
            </div>

            <Separator />

            {/* Custom Fields */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-foreground text-sm">Campos Personalizados</h4>
                  <p className="text-xs text-muted-foreground">Mapeie os campos do GHL para que a IA entenda cada um</p>
                </div>
                <Button variant="outline" size="sm" onClick={addCustomField}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar
                </Button>
              </div>
              <AnimatePresence>
                {customFields.map((field) => (
                  <motion.div key={field.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-start gap-3">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Input placeholder="Nome do campo no GHL" value={field.ghlFieldName} onChange={(e) => updateCustomField(field.id, "ghlFieldName", e.target.value)} />
                      <Input placeholder="Descrição para a IA" value={field.description} onChange={(e) => updateCustomField(field.id, "description", e.target.value)} />
                    </div>
                    <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeCustomField(field.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <Separator />

            {/* Pipeline Stages */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-foreground text-sm">Etapas do Funil</h4>
                  <p className="text-xs text-muted-foreground">Descreva cada etapa para que a IA saiba quando mover o lead</p>
                </div>
                <Button variant="outline" size="sm" onClick={addPipelineStage}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar
                </Button>
              </div>
              <AnimatePresence>
                {pipelineStages.map((stage) => (
                  <motion.div key={stage.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-start gap-3">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Input placeholder="Nome da etapa" value={stage.stageName} onChange={(e) => updatePipelineStage(stage.id, "stageName", e.target.value)} />
                      <Input placeholder="Descrição para a IA" value={stage.description} onChange={(e) => updatePipelineStage(stage.id, "description", e.target.value)} />
                    </div>
                    <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removePipelineStage(stage.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <Separator />

            {/* AI Prompt */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <h4 className="font-semibold text-foreground text-sm">Prompt da IA</h4>
              </div>
              <p className="text-xs text-muted-foreground">Instruções adicionais para a IA ao analisar conversas.</p>
              <Textarea rows={4} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Instruções adicionais para a IA..." className="resize-none" />
            </div>

            <Button onClick={handleSaveMappings}>Salvar mapeamento</Button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Integrations;
