import { MessageSquare, Link2, CheckCircle, XCircle, RefreshCw, Sparkles, Loader2, Wifi, WifiOff, Download, Plus, Trash2, Copy, Clock, Pencil } from "lucide-react";
import { WebhookLogs } from "@/components/WebhookLogs";
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
import { useWorkspace } from "@/contexts/WorkspaceContext";

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
type WhatsAppProvider = "uazap" | "stevo";

interface WhatsAppInstance {
  id: string;
  instanceName: string;
  label: string;
  status: WhatsAppStatus;
  provider: WhatsAppProvider;
  qrCode?: string | null;
  loading?: boolean;
  webhookUrl?: string;
  lastWebhookAt?: string | null;
}

const Integrations = () => {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(true);
  const [creatingNew, setCreatingNew] = useState(false);
  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editLabelValue, setEditLabelValue] = useState("");
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
  const { activeWorkspace } = useWorkspace();

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
        body: JSON.stringify({ action, workspace_id: activeWorkspace?.id, ...extra }),
      }
    );
    const result = await response.json();
    if (!result.success) throw new Error(result.error || "Unknown error");
    return result.data;
  }, [activeWorkspace]);

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
        const fieldOptions: FieldOption[] = [];
        const rawOptions = f.picklistOptions || f.options || [];
        if (Array.isArray(rawOptions)) {
          for (const opt of rawOptions) {
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
      
      const allFields = [...GHL_STANDARD_FIELDS, ...customFields].map(f => {
        const saved = savedFields.find((sf: any) => sf.id === f.id);
        if (saved) {
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

  // Fetch all WhatsApp instances on mount (Uazap + Stevo)
  useEffect(() => {
    if (!activeWorkspace) return;
    const checkStatus = async () => {
      setLoadingInstances(true);
      const allInstances: WhatsAppInstance[] = [];

      // Fetch Uazap instances
      try {
        const data = await callUazap("status", { workspace_id: activeWorkspace.id });
        if (data?.instances && data.instances.length > 0) {
          for (const inst of data.instances) {
            allInstances.push({
              id: inst.id,
              instanceName: inst.instanceName || "",
              label: inst.label || inst.instanceName || "WhatsApp",
              status: inst.status as WhatsAppStatus,
              provider: "uazap",
            });
          }
        }
      } catch { /* silent */ }

      // Fetch Stevo instances from DB
      try {
        const { data: stevoIntegrations } = await supabase
          .from("integrations")
          .select("*")
          .eq("type", "whatsapp_stevo")
          .eq("workspace_id", activeWorkspace.id)
          .order("created_at", { ascending: true });

        if (stevoIntegrations) {
          for (const int of stevoIntegrations) {
            const config = int.config as { label?: string; last_webhook_at?: string } || {};
            allInstances.push({
              id: int.id,
              instanceName: "",
              label: config.label || "Stevo",
              status: (int.status as WhatsAppStatus) || "disconnected",
              provider: "stevo",
              webhookUrl: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stevo-webhook?id=${int.id}`,
              lastWebhookAt: config.last_webhook_at || null,
            });
          }
        }
      } catch { /* silent */ }

      setInstances(allInstances);
      setLoadingInstances(false);

      try {
        const data = await callGhl("status", { workspace_id: activeWorkspace.id });
        if (data?.status === "connected") {
          setGhlConnected(true);
          setGhlLocationName(data.locationName || "");
        } else {
          resetGhlState();
        }
      } catch { /* silent */ }
    };
    checkStatus();
  }, [activeWorkspace, callUazap, callGhl, resetGhlState]);

  useEffect(() => {
    if (ghlConnected) {
      fetchGhlFieldsAndStages();
    }
  }, [ghlConnected, fetchGhlFieldsAndStages]);

  // Poll for connecting Uazap instances only
  useEffect(() => {
    const connectingInstances = instances.filter(i => i.status === "connecting" && i.provider === "uazap");
    if (connectingInstances.length === 0) return;

    const interval = setInterval(async () => {
      for (const inst of connectingInstances) {
        try {
          const data = await callUazap("status", { integration_id: inst.id });
          if (data?.status === "connected" || data?.instance?.status === "connected") {
            setInstances(prev => prev.map(i =>
              i.id === inst.id ? { ...i, status: "connected", qrCode: null } : i
            ));
            toast({ title: `${inst.label} conectado com sucesso!` });
          } else {
            const newQr = data?.instance?.qrcode || data?.qrcode;
            if (newQr) {
              setInstances(prev => prev.map(i =>
                i.id === inst.id ? { ...i, qrCode: newQr } : i
              ));
            }
          }
        } catch { /* ignore */ }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [instances, callUazap, toast]);

  const updateInstance = (id: string, updates: Partial<WhatsAppInstance>) => {
    setInstances(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };

  const handleCreateUazapInstance = async () => {
    setCreatingNew(true);
    setShowProviderPicker(false);
    try {
      const data = await callUazap("create");
      const newId = data.integration_id;
      toast({ title: "Instância criada!", description: "Gerando QR Code..." });

      const connectData = await callUazap("connect", { integration_id: newId });
      const qr = connectData?.qrcode || connectData?.instance?.qrcode || connectData?.base64 || null;

      const newInst: WhatsAppInstance = {
        id: newId,
        instanceName: data.instanceName || "",
        label: `Uazap #${instances.filter(i => i.provider === "uazap").length + 1}`,
        status: "connecting",
        provider: "uazap",
        qrCode: qr || null,
      };

      if (!qr) {
        const statusData = await callUazap("status", { integration_id: newId });
        newInst.qrCode = statusData?.instance?.qrcode || statusData?.qrcode || null;
      }

      setInstances(prev => [...prev, newInst]);
    } catch (error) {
      toast({ title: "Erro", description: error instanceof Error ? error.message : "Erro ao criar instância", variant: "destructive" });
    } finally {
      setCreatingNew(false);
    }
  };

  const handleCreateStevoInstance = async () => {
    setCreatingNew(true);
    setShowProviderPicker(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      if (!activeWorkspace) throw new Error("No active workspace");

      const { data: inserted, error } = await supabase.from("integrations").insert({
        user_id: session.user.id,
        workspace_id: activeWorkspace.id,
        type: "whatsapp_stevo",
        config: { label: `Stevo #${instances.filter(i => i.provider === "stevo").length + 1}` },
        status: "disconnected",
      }).select().single();

      if (error) throw error;

      const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stevo-webhook?id=${inserted.id}`;

      setInstances(prev => [...prev, {
        id: inserted.id,
        instanceName: "",
        label: `Stevo #${prev.filter(i => i.provider === "stevo").length + 1}`,
        status: "disconnected",
        provider: "stevo",
        webhookUrl,
        lastWebhookAt: null,
      }]);

      toast({ title: "Instância Stevo criada!", description: "Copie o webhook e cole no Stevo." });
    } catch (error) {
      toast({ title: "Erro", description: error instanceof Error ? error.message : "Erro ao criar", variant: "destructive" });
    } finally {
      setCreatingNew(false);
    }
  };

  const handleReconnect = async (inst: WhatsAppInstance) => {
    if (inst.provider !== "uazap") return;
    updateInstance(inst.id, { loading: true });
    try {
      const connectData = await callUazap("connect", { integration_id: inst.id });
      const qr = connectData?.qrcode || connectData?.instance?.qrcode || connectData?.base64 || null;
      if (qr) {
        updateInstance(inst.id, { status: "connecting", qrCode: qr, loading: false });
      } else {
        const statusData = await callUazap("status", { integration_id: inst.id });
        const statusQr = statusData?.instance?.qrcode || statusData?.qrcode || null;
        updateInstance(inst.id, { status: "connecting", qrCode: statusQr, loading: false });
      }
    } catch (error) {
      toast({ title: "Erro", description: error instanceof Error ? error.message : "Erro ao reconectar", variant: "destructive" });
      updateInstance(inst.id, { loading: false });
    }
  };

  const handleDisconnect = async (inst: WhatsAppInstance) => {
    if (inst.provider !== "uazap") return;
    updateInstance(inst.id, { loading: true });
    try {
      await callUazap("disconnect", { integration_id: inst.id });
      updateInstance(inst.id, { status: "disconnected", qrCode: null, loading: false });
      toast({ title: `${inst.label} desconectado` });
    } catch (error) {
      toast({ title: "Erro", description: error instanceof Error ? error.message : "Erro ao desconectar", variant: "destructive" });
      updateInstance(inst.id, { loading: false });
    }
  };

  const handleDeleteInstance = async (inst: WhatsAppInstance) => {
    if (!confirm(`Tem certeza que deseja remover ${inst.label}?`)) return;
    updateInstance(inst.id, { loading: true });
    try {
      if (inst.provider === "uazap") {
        await callUazap("delete", { integration_id: inst.id });
      } else {
        await supabase.from("integrations").delete().eq("id", inst.id);
      }
      setInstances(prev => prev.filter(i => i.id !== inst.id));
      toast({ title: `${inst.label} removido` });
    } catch (error) {
      toast({ title: "Erro", description: error instanceof Error ? error.message : "Erro ao remover", variant: "destructive" });
      updateInstance(inst.id, { loading: false });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!", description: "Webhook URL copiado para a área de transferência." });
  };

  const handleRenameInstance = async (inst: WhatsAppInstance) => {
    const newLabel = editLabelValue.trim();
    if (!newLabel || newLabel === inst.label) {
      setEditingLabel(null);
      return;
    }
    try {
      if (inst.provider === "uazap") {
        // Update label in integration config via uazap-manage or directly
        const { data: integration } = await supabase
          .from("integrations")
          .select("config")
          .eq("id", inst.id)
          .single();
        const config = (integration?.config as Record<string, unknown>) || {};
        await supabase.from("integrations").update({ config: { ...config, label: newLabel } }).eq("id", inst.id);
      } else {
        const { data: integration } = await supabase
          .from("integrations")
          .select("config")
          .eq("id", inst.id)
          .single();
        const config = (integration?.config as Record<string, unknown>) || {};
        await supabase.from("integrations").update({ config: { ...config, label: newLabel } }).eq("id", inst.id);
      }
      updateInstance(inst.id, { label: newLabel });
      setEditingLabel(null);
      toast({ title: "Nome atualizado!" });
    } catch (error) {
      toast({ title: "Erro", description: error instanceof Error ? error.message : "Erro ao renomear", variant: "destructive" });
    }
  };

  const toggleField = (id: string) => {
    setGhlFields(prev => prev.map(f => f.id === id ? { ...f, selected: !f.selected } : f));
  };

  const updateFieldDescription = (id: string, description: string) => {
    setGhlFields(prev => prev.map(f => f.id === id ? { ...f, description } : f));
  };

  const updateOptionInstruction = (fieldId: string, optionValue: string, instruction: string) => {
    setGhlFields(prev => prev.map(f => {
      if (f.id !== fieldId || !f.options) return f;
      return {
        ...f,
        options: f.options.map(opt => opt.value === optionValue ? { ...opt, instruction } : opt),
      };
    }));
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

  const getStatusBadge = (status: WhatsAppStatus) => {
    switch (status) {
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
    <div className="flex gap-6">
      <div className="space-y-6 flex-1 max-w-3xl">
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
              <h3 className="font-semibold text-foreground">WhatsApp</h3>
              <p className="text-sm text-muted-foreground">
                {instances.length === 0 ? "Nenhum número conectado" : `${instances.length} número${instances.length > 1 ? "s" : ""} configurado${instances.length > 1 ? "s" : ""}`}
              </p>
            </div>
          </div>
          <div className="relative">
            <Button size="sm" onClick={() => setShowProviderPicker(!showProviderPicker)} disabled={creatingNew}>
              {creatingNew ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Criando...</> : <><Plus className="w-4 h-4 mr-1" /> Adicionar número</>}
            </Button>
            {showProviderPicker && (
              <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-10 w-48">
                <button
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors rounded-t-lg"
                  onClick={handleCreateUazapInstance}
                >
                  <span className="font-medium text-foreground">Uazap</span>
                  <p className="text-xs text-muted-foreground">Conexão via QR Code</p>
                </button>
                <button
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors rounded-b-lg border-t border-border"
                  onClick={handleCreateStevoInstance}
                >
                  <span className="font-medium text-foreground">Stevo</span>
                  <p className="text-xs text-muted-foreground">Conexão via Webhook</p>
                </button>
              </div>
            )}
          </div>
        </div>

        {loadingInstances ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : instances.length === 0 ? (
          <div className="bg-muted rounded-lg p-6 flex flex-col items-center gap-4">
            <Wifi className="w-12 h-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">Conecte seu WhatsApp para começar a receber e analisar mensagens automaticamente.</p>
            <div className="flex gap-2">
              <Button onClick={handleCreateUazapInstance} disabled={creatingNew} variant="outline">
                Uazap (QR Code)
              </Button>
              <Button onClick={handleCreateStevoInstance} disabled={creatingNew} variant="outline">
                Stevo (Webhook)
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {instances.map((inst) => (
              <div key={inst.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-success" />
                    {editingLabel === inst.id ? (
                      <Input
                        className="h-7 w-40 text-sm"
                        value={editLabelValue}
                        onChange={(e) => setEditLabelValue(e.target.value)}
                        onBlur={() => handleRenameInstance(inst)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleRenameInstance(inst); if (e.key === "Escape") setEditingLabel(null); }}
                        autoFocus
                      />
                    ) : (
                      <>
                        <span className="text-sm font-medium text-foreground">{inst.label}</span>
                        <button
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => { setEditingLabel(inst.id); setEditLabelValue(inst.label); }}
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </>
                    )}
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                      {inst.provider === "uazap" ? "Uazap" : "Stevo"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {inst.provider === "uazap" && getStatusBadge(inst.status)}
                    {inst.provider === "stevo" && (
                      inst.lastWebhookAt
                        ? <Badge variant="outline" className="text-success border-success/30"><CheckCircle className="w-3 h-3 mr-1" /> Ativo</Badge>
                        : <Badge variant="outline" className="text-muted-foreground border-border"><Clock className="w-3 h-3 mr-1" /> Aguardando</Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
                      onClick={() => handleDeleteInstance(inst)}
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
                          <img src={inst.qrCode.startsWith("data:") ? inst.qrCode : `data:image/png;base64,${inst.qrCode}`} alt="QR Code" className="w-full h-full object-contain" />
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
                    <Button variant="outline" size="sm" onClick={() => handleReconnect(inst)} disabled={inst.loading}>
                      <RefreshCw className="w-3 h-3 mr-1" /> Novo QR Code
                    </Button>
                  </div>
                )}

                {inst.provider === "uazap" && inst.status === "disconnected" && (
                  <div className="bg-muted rounded-lg p-3 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Instância desconectada</p>
                    <Button size="sm" variant="outline" onClick={() => handleReconnect(inst)} disabled={inst.loading}>
                      {inst.loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                      Reconectar
                    </Button>
                  </div>
                )}

                {inst.provider === "uazap" && inst.status === "connected" && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleReconnect(inst)} disabled={inst.loading}>
                      <RefreshCw className="w-3 h-3 mr-1" /> Reconectar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDisconnect(inst)} disabled={inst.loading}>
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
                        <Button size="sm" variant="outline" className="h-7 px-2 shrink-0" onClick={() => copyToClipboard(inst.webhookUrl!)}>
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
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* CRM */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
              <Link2 className="w-5 h-5 text-info" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">CRM</h3>
              <p className="text-sm text-muted-foreground">
                {ghlConnected && ghlLocationName ? `Conectado: ${ghlLocationName}` : "Integração com seu CRM"}
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
              Insira seu Private Integration Token e Location ID. Encontre em: Settings → Integrations → API Keys.
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
                  toast({ title: "CRM conectado!", description: `Location: ${data.locationName || ghlLocationId}` });
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
                  toast({ title: "CRM desconectado" });
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

            {/* Custom Fields */}
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-foreground text-sm">Campos do CRM</h4>
                <p className="text-xs text-muted-foreground">Selecione os campos que a IA deve considerar e descreva o que cada um representa</p>
              </div>

              {loadingFields ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando campos do CRM...
                </div>
              ) : ghlFields.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nenhum campo encontrado no CRM.</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-1">Campos padrão</p>
                  {ghlFields.filter(f => f.id.startsWith("std_")).map((field) => (
                    <div key={field.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors">
                      <Checkbox id={`field-${field.id}`} checked={field.selected} onCheckedChange={() => toggleField(field.id)} className="mt-1" />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <label htmlFor={`field-${field.id}`} className="text-sm font-medium text-foreground cursor-pointer">{field.name}</label>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{field.dataType}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">{field.fieldKey}</p>
                        {field.selected && (
                          <>
                            <Input placeholder="Descreva este campo para a IA" value={field.description} onChange={(e) => updateFieldDescription(field.id, e.target.value)} className="text-sm" />
                            {field.options && field.options.length > 0 && (
                              <div className="ml-2 space-y-2 border-l-2 border-border pl-3">
                                <p className="text-xs font-medium text-muted-foreground">Opções ({field.options.length}):</p>
                                {field.options.map((opt) => (
                                  <div key={opt.value} className="space-y-1">
                                    <p className="text-xs font-medium text-foreground">{opt.value}</p>
                                    <Input placeholder={`Quando usar "${opt.value}"?`} value={opt.instruction} onChange={(e) => updateOptionInstruction(field.id, opt.value, e.target.value)} className="text-xs h-7" />
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}

                  {ghlFields.filter(f => !f.id.startsWith("std_")).length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-3">Campos personalizados</p>
                      {ghlFields.filter(f => !f.id.startsWith("std_")).map((field) => (
                        <div key={field.id} className="flex items-start gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors">
                          <Checkbox id={`field-${field.id}`} checked={field.selected} onCheckedChange={() => toggleField(field.id)} className="mt-1" />
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <label htmlFor={`field-${field.id}`} className="text-sm font-medium text-foreground cursor-pointer">{field.name}</label>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">personalizado</Badge>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{field.dataType}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono">{field.fieldKey}</p>
                            {field.selected && (
                              <>
                                <Input placeholder="Descreva este campo para a IA" value={field.description} onChange={(e) => updateFieldDescription(field.id, e.target.value)} className="text-sm" />
                                {field.options && field.options.length > 0 && (
                                  <div className="ml-2 space-y-2 border-l-2 border-primary/20 pl-3">
                                    <p className="text-xs font-medium text-muted-foreground">Opções ({field.options.length}):</p>
                                    {field.options.map((opt) => (
                                      <div key={opt.value} className="space-y-1">
                                        <p className="text-xs font-medium text-foreground">{opt.value}</p>
                                        <Input placeholder={`Quando usar "${opt.value}"?`} value={opt.instruction} onChange={(e) => updateOptionInstruction(field.id, opt.value, e.target.value)} className="text-xs h-7" />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
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

            {/* Pipeline Stages */}
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-foreground text-sm">Etapas do Funil</h4>
                <p className="text-xs text-muted-foreground">Selecione as etapas que a IA deve usar e descreva quando mover o lead para cada uma</p>
              </div>

              {loadingStages ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando etapas do CRM...
                </div>
              ) : ghlStages.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nenhum funil encontrado no CRM.</p>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {ghlStages.map((stage) => (
                    <div key={stage.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors">
                      <Checkbox id={`stage-${stage.id}`} checked={stage.selected} onCheckedChange={() => toggleStage(stage.id)} className="mt-1" />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <label htmlFor={`stage-${stage.id}`} className="text-sm font-medium text-foreground cursor-pointer">{stage.name}</label>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{stage.pipelineName}</Badge>
                        </div>
                        {stage.selected && (
                          <Input placeholder="Quando mover o lead para esta etapa?" value={stage.description} onChange={(e) => updateStageDescription(stage.id, e.target.value)} className="text-sm" />
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
      <div className="hidden xl:block w-80 shrink-0">
        <WebhookLogs />
      </div>
    </div>
  );
};

export default Integrations;
