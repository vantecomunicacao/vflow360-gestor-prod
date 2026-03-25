import { MessageSquare, Link2, CheckCircle, XCircle, RefreshCw, Settings, Sparkles, Loader2, Wifi, WifiOff, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { motion } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface FieldOption {
  value: string;
  instruction: string;
}

interface GhlCustomField {
  id: string;
  name: string;
  fieldKey: string;
  dataType: string;
  selected: boolean;
  description: string;
  options?: FieldOption[];
}

interface GhlPipelineStage {
  id: string;
  name: string;
  pipelineId: string;
  pipelineName: string;
  selected: boolean;
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
  const [ghlFields, setGhlFields] = useState<GhlCustomField[]>([]);
  const [ghlStages, setGhlStages] = useState<GhlPipelineStage[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [loadingStages, setLoadingStages] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(
    "Você é um assistente de CRM. Ao analisar conversas, leve em conta os campos personalizados e etapas do funil mapeados abaixo para gerar sugestões precisas."
  );
  const { toast } = useToast();

  const resetGhlState = useCallback(() => {
    setGhlConnected(false);
    setGhlLocationName("");
    setGhlFields([]);
    setGhlStages([]);
  }, []);

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

  const GHL_STANDARD_FIELDS: GhlCustomField[] = [
    { id: "std_firstName", name: "Nome", fieldKey: "firstName", dataType: "text", selected: false, description: "" },
    { id: "std_lastName", name: "Sobrenome", fieldKey: "lastName", dataType: "text", selected: false, description: "" },
    { id: "std_name", name: "Nome completo", fieldKey: "name", dataType: "text", selected: false, description: "" },
    { id: "std_email", name: "Email", fieldKey: "email", dataType: "text", selected: false, description: "" },
    { id: "std_phone", name: "Telefone", fieldKey: "phone", dataType: "text", selected: false, description: "" },
    { id: "std_address1", name: "Endereço", fieldKey: "address1", dataType: "text", selected: false, description: "" },
    { id: "std_city", name: "Cidade", fieldKey: "city", dataType: "text", selected: false, description: "" },
    { id: "std_state", name: "Estado", fieldKey: "state", dataType: "text", selected: false, description: "" },
    { id: "std_country", name: "País", fieldKey: "country", dataType: "text", selected: false, description: "" },
    { id: "std_postalCode", name: "CEP", fieldKey: "postalCode", dataType: "text", selected: false, description: "" },
    { id: "std_website", name: "Website", fieldKey: "website", dataType: "text", selected: false, description: "" },
    { id: "std_companyName", name: "Empresa", fieldKey: "companyName", dataType: "text", selected: false, description: "" },
    { id: "std_source", name: "Origem", fieldKey: "source", dataType: "text", selected: false, description: "" },
    { id: "std_tags", name: "Tags", fieldKey: "tags", dataType: "array", selected: false, description: "" },
    { id: "std_dnd", name: "Não perturbe (DND)", fieldKey: "dnd", dataType: "boolean", selected: false, description: "" },
    { id: "std_dateOfBirth", name: "Data de nascimento", fieldKey: "dateOfBirth", dataType: "date", selected: false, description: "" },
  ];

  const fetchGhlFieldsAndStages = useCallback(async () => {
    setLoadingFields(true);
    setLoadingStages(true);
    setGhlFields([]);
    setGhlStages([]);
    
    // Load saved mappings first
    let savedFields: any[] = [];
    let savedStages: any[] = [];
    let savedPrompt = "";
    try {
      const mappingsData = await callGhl("get_mappings");
      savedFields = mappingsData?.selectedFields || [];
      savedStages = mappingsData?.selectedStages || [];
      savedPrompt = mappingsData?.aiPrompt || "";
      if (savedPrompt) setAiPrompt(savedPrompt);
    } catch { /* ignore */ }

    try {
      const fieldsData = await callGhl("custom_fields");
      const customFields: GhlCustomField[] = (fieldsData?.customFields || fieldsData || []).map((f: any) => {
        // Extract options for dropdown/select fields
        const fieldOptions: FieldOption[] = [];
        if (f.options && Array.isArray(f.options)) {
          for (const opt of f.options) {
            if (typeof opt === "string") fieldOptions.push({ value: opt, instruction: "" });
            else if (opt?.value) fieldOptions.push({ value: opt.value, instruction: "" });
            else if (opt?.name) fieldOptions.push({ value: opt.name, instruction: "" });
          }
        }
        return {
          id: f.id,
          name: f.name || f.fieldKey || f.id,
          fieldKey: f.fieldKey || f.key || f.id,
          dataType: f.dataType || f.type || "text",
          selected: false,
          description: "",
          options: fieldOptions.length > 0 ? fieldOptions : undefined,
        };
      });
      
      // Merge with saved selections
      const allFields = [...GHL_STANDARD_FIELDS, ...customFields].map(f => {
        const saved = savedFields.find((sf: any) => sf.id === f.id);
        if (saved) {
          // Merge saved option instructions with current options
          let mergedOptions = f.options;
          if (f.options && saved.options) {
            mergedOptions = f.options.map((opt: FieldOption) => {
              const savedOpt = saved.options?.find((so: any) => 
                (typeof so === "string" ? so : so.value) === opt.value
              );
              return savedOpt && typeof savedOpt === "object" 
                ? { ...opt, instruction: savedOpt.instruction || "" }
                : opt;
            });
          }
          return { ...f, selected: true, description: saved.description || "", options: mergedOptions || saved.options };
        }
        return f;
      });
      setGhlFields(allFields);
    } catch (error) {
      console.error("Error fetching GHL fields:", error);
      const allFields = GHL_STANDARD_FIELDS.map(f => {
        const saved = savedFields.find((sf: any) => sf.id === f.id);
        return saved ? { ...f, selected: true, description: saved.description || "" } : f;
      });
      setGhlFields(allFields);
    } finally {
      setLoadingFields(false);
    }

    try {
      const pipelinesData = await callGhl("pipelines");
      const stages: GhlPipelineStage[] = [];
      const pipelines = pipelinesData?.pipelines || pipelinesData || [];
      for (const pipeline of pipelines) {
        const pStages = pipeline.stages || [];
        for (const stage of pStages) {
          const saved = savedStages.find((ss: any) => ss.id === stage.id);
          stages.push({
            id: stage.id,
            name: stage.name,
            pipelineId: pipeline.id,
            pipelineName: pipeline.name,
            selected: saved ? true : false,
            description: saved?.description || "",
          });
        }
      }
      setGhlStages(stages);
    } catch (error) {
      console.error("Error fetching GHL pipelines:", error);
      setGhlStages([]);
    } finally {
      setLoadingStages(false);
    }
  }, [callGhl]);

  // Check status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const data = await callUazap("status");
        // data.status can be an object like {connected: true} or a string
        const isConnected = data?.status?.connected === true || data?.instance?.status === "connected" || data?.status === "connected";
        if (isConnected) {
          setWhatsappStatus("connected");
        } else if (data?.status === "not_created" || (!data?.instance && !data?.status)) {
          setWhatsappStatus("not_created");
        } else {
          setWhatsappStatus("disconnected");
        }
      } catch { /* silent */ }

      try {
        const data = await callGhl("status");
        if (data?.status === "connected") {
          setGhlConnected(true);
          setGhlLocationName(data.locationName || "");
        } else {
          resetGhlState();
        }
      } catch { /* silent */ }
    };
    checkStatus();
  }, [callUazap, callGhl, resetGhlState]);

  // Fetch fields/stages when GHL connects
  useEffect(() => {
    if (ghlConnected) {
      fetchGhlFieldsAndStages();
    }
  }, [ghlConnected, fetchGhlFieldsAndStages]);

  // Poll for WA status while connecting
  useEffect(() => {
    if (whatsappStatus !== "connecting") return;
    const interval = setInterval(async () => {
      try {
        const data = await callUazap("status");
        if (data?.status === "connected" || data?.instance?.status === "connected") {
          setWhatsappStatus("connected");
          setQrCode(null);
          toast({ title: "WhatsApp conectado com sucesso!" });
        } else {
          // Update QR code if available from status
          const newQr = data?.instance?.qrcode || data?.qrcode;
          if (newQr) setQrCode(newQr);
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [whatsappStatus, callUazap, toast]);

  const handleCreateAndConnect = async () => {
    setLoadingWa(true);
    try {
      await callUazap("create");
      toast({ title: "Instância criada!", description: "Gerando QR Code..." });
      const connectData = await callUazap("connect");
      const qr = connectData?.qrcode || connectData?.instance?.qrcode || connectData?.base64 || null;
      if (qr) {
        setQrCode(qr);
        setWhatsappStatus("connecting");
      } else {
        // Fallback: use status endpoint which returns qrcode when connecting
        const statusData = await callUazap("status");
        const statusQr = statusData?.instance?.qrcode || statusData?.qrcode || null;
        setQrCode(statusQr);
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
      const qr = connectData?.qrcode || connectData?.instance?.qrcode || connectData?.base64 || null;
      if (qr) {
        setQrCode(qr);
        setWhatsappStatus("connecting");
      } else {
        const statusData = await callUazap("status");
        const statusQr = statusData?.instance?.qrcode || statusData?.qrcode || null;
        setQrCode(statusQr);
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

  const toggleField = (id: string) => {
    setGhlFields(prev => prev.map(f => f.id === id ? { ...f, selected: !f.selected } : f));
  };

  const updateFieldDescription = (id: string, description: string) => {
    setGhlFields(prev => prev.map(f => f.id === id ? { ...f, description } : f));
  };

  const toggleStage = (id: string) => {
    setGhlStages(prev => prev.map(s => s.id === id ? { ...s, selected: !s.selected } : s));
  };

  const updateStageDescription = (id: string, description: string) => {
    setGhlStages(prev => prev.map(s => s.id === id ? { ...s, description } : s));
  };

  const handleSaveMappings = async () => {
    const selectedFields = ghlFields.filter(f => f.selected).map(f => ({ id: f.id, fieldKey: f.fieldKey, name: f.name, dataType: f.dataType, description: f.description, options: f.options || undefined }));
    const selectedStages = ghlStages.filter(s => s.selected).map(s => ({ id: s.id, name: s.name, pipelineId: s.pipelineId, pipelineName: s.pipelineName, description: s.description }));
    try {
      await callGhl("save_mappings", { selectedFields, selectedStages, aiPrompt });
      toast({ title: "Mapeamento salvo!", description: `${selectedFields.length} campos e ${selectedStages.length} etapas selecionados.` });
    } catch (error) {
      toast({ title: "Erro ao salvar", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    }
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
            <p className="text-sm text-muted-foreground text-center">Conecte seu WhatsApp para começar a receber e analisar mensagens automaticamente.</p>
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
                  <img src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`} alt="QR Code WhatsApp" className="w-full h-full object-contain" />
                </div>
                <p className="text-sm text-muted-foreground text-center">Escaneie o QR Code com seu WhatsApp para conectar</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Aguardando conexão...
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
            <p className="text-sm text-muted-foreground text-center">Sua instância está desconectada. Reconecte para continuar recebendo mensagens.</p>
            <Button onClick={handleReconnect} disabled={loadingWa}>
              {loadingWa ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Reconectando...</> : <><RefreshCw className="w-4 h-4 mr-2" /> Reconectar</>}
            </Button>
          </div>
        )}

        {whatsappStatus === "connected" && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReconnect} disabled={loadingWa}><RefreshCw className="w-4 h-4 mr-1" /> Reconectar</Button>
            <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={loadingWa}>Desconectar</Button>
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
              <p className="text-sm text-muted-foreground">
                {ghlConnected && ghlLocationName ? `Conectado: ${ghlLocationName}` : "Integração com CRM"}
              </p>
            </div>
          </div>
          <Badge variant="outline" className={ghlConnected ? "text-success border-success/30" : "text-destructive border-destructive/30"}>
            {ghlConnected ? <><CheckCircle className="w-3 h-3 mr-1" /> Conectado</> : <><XCircle className="w-3 h-3 mr-1" /> Desconectado</>}
          </Badge>
        </div>

        {!ghlConnected ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Insira seu Private Integration Token e Location ID do Go High Level. Encontre em: Settings → Integrations → API Keys.
            </p>
            <div className="space-y-2">
              <Label>API Key (Private Integration Token)</Label>
              <Input placeholder="pit-xxxxxxxx..." value={ghlApiKey} onChange={(e) => setGhlApiKey(e.target.value)} type="password" />
            </div>
            <div className="space-y-2">
              <Label>Location ID</Label>
              <Input placeholder="Seu Location ID" value={ghlLocationId} onChange={(e) => setGhlLocationId(e.target.value)} />
            </div>
            <Button
              onClick={async () => {
                if (!ghlApiKey || !ghlLocationId) {
                  toast({ title: "Erro", description: "Preencha a API Key e o Location ID.", variant: "destructive" });
                  return;
                }
                setLoadingGhl(true);
                try {
                  const data = await callGhl("connect", { apiKey: ghlApiKey, locationId: ghlLocationId });
                  setGhlConnected(true);
                  setGhlLocationName(data.locationName || "");
                  setGhlApiKey("");
                  setGhlLocationId("");
                  toast({ title: "GHL conectado!", description: `Location: ${data.locationName || ghlLocationId}` });
                } catch (error) {
                  resetGhlState();
                  toast({ title: "Erro ao conectar", description: error instanceof Error ? error.message : "Verifique suas credenciais", variant: "destructive" });
                } finally {
                  setLoadingGhl(false);
                }
              }}
              disabled={loadingGhl}
            >
              {loadingGhl ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Conectando...</> : <><Link2 className="w-4 h-4 mr-1" /> Conectar</>}
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchGhlFieldsAndStages} disabled={loadingFields || loadingStages}>
                <Download className="w-4 h-4 mr-1" /> {loadingFields || loadingStages ? "Carregando..." : "Recarregar dados"}
              </Button>
              <Button variant="outline" size="sm" disabled={loadingGhl} onClick={async () => {
                setLoadingGhl(true);
                try {
                  await callGhl("disconnect");
                  resetGhlState();
                  toast({ title: "GHL desconectado" });
                } catch (error) {
                  toast({ title: "Erro", description: error instanceof Error ? error.message : "Erro ao desconectar", variant: "destructive" });
                } finally {
                  setLoadingGhl(false);
                }
              }}>
                Desconectar
              </Button>
            </div>

            <Separator />

            {/* Custom Fields from GHL */}
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-foreground text-sm">Campos do GHL</h4>
                <p className="text-xs text-muted-foreground">Selecione os campos que a IA deve considerar e descreva o que cada um representa</p>
              </div>

              {loadingFields ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando campos do GHL...
                </div>
              ) : ghlFields.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nenhum campo encontrado no GHL.</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {/* Standard fields */}
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-1">Campos padrão</p>
                  {ghlFields.filter(f => f.id.startsWith("std_")).map((field) => (
                    <div key={field.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors">
                      <Checkbox
                        id={`field-${field.id}`}
                        checked={field.selected}
                        onCheckedChange={() => toggleField(field.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <label htmlFor={`field-${field.id}`} className="text-sm font-medium text-foreground cursor-pointer">
                            {field.name}
                          </label>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{field.dataType}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">{field.fieldKey}</p>
                        {field.selected && (
                          <Input
                            placeholder="Descreva este campo para a IA (ex: 'Interesse principal do lead')"
                            value={field.description}
                            onChange={(e) => updateFieldDescription(field.id, e.target.value)}
                            className="text-sm"
                          />
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Custom fields */}
                  {ghlFields.filter(f => !f.id.startsWith("std_")).length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-3">Campos personalizados</p>
                      {ghlFields.filter(f => !f.id.startsWith("std_")).map((field) => (
                        <div key={field.id} className="flex items-start gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors">
                          <Checkbox
                            id={`field-${field.id}`}
                            checked={field.selected}
                            onCheckedChange={() => toggleField(field.id)}
                            className="mt-1"
                          />
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <label htmlFor={`field-${field.id}`} className="text-sm font-medium text-foreground cursor-pointer">
                                {field.name}
                              </label>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">personalizado</Badge>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{field.dataType}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono">{field.fieldKey}</p>
                            {field.selected && (
                              <Input
                                placeholder="Descreva este campo para a IA (ex: 'Interesse principal do lead')"
                                value={field.description}
                                onChange={(e) => updateFieldDescription(field.id, e.target.value)}
                                className="text-sm"
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Pipeline Stages from GHL */}
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-foreground text-sm">Etapas do Funil</h4>
                <p className="text-xs text-muted-foreground">Selecione as etapas que a IA deve usar e descreva quando mover o lead para cada uma</p>
              </div>

              {loadingStages ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando etapas do GHL...
                </div>
              ) : ghlStages.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nenhum funil encontrado no GHL.</p>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {ghlStages.map((stage) => (
                    <div key={stage.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors">
                      <Checkbox
                        id={`stage-${stage.id}`}
                        checked={stage.selected}
                        onCheckedChange={() => toggleStage(stage.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <label htmlFor={`stage-${stage.id}`} className="text-sm font-medium text-foreground cursor-pointer">
                            {stage.name}
                          </label>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{stage.pipelineName}</Badge>
                        </div>
                        {stage.selected && (
                          <Input
                            placeholder="Quando mover o lead para esta etapa? (ex: 'Quando confirmar interesse em agendar')"
                            value={stage.description}
                            onChange={(e) => updateStageDescription(stage.id, e.target.value)}
                            className="text-sm"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
