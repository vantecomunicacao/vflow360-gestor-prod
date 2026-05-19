import { Loader2, MessageSquare, Wifi } from "lucide-react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { WebhookLogs } from "@/components/WebhookLogs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { WhatsAppProviderPicker } from "@/components/integrations/WhatsAppProviderPicker";
import { WhatsAppInstanceCard } from "@/components/integrations/WhatsAppInstanceCard";
import { GhlSection } from "@/components/integrations/GhlSection";
import { AiPipelineFilter } from "@/components/integrations/AiPipelineFilter";
import {
  FieldOption,
  GhlCustomField,
  GhlPipelineStage,
  GhlUserOption,
  WhatsAppInstance,
  WhatsAppStatus,
} from "@/components/integrations/types";

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
    "Você é um assistente de CRM. Ao analisar conversas, leve em conta os campos personalizados e etapas do funil mapeados abaixo para gerar sugestões precisas.",
  );
  const [ghlUsers, setGhlUsers] = useState<GhlUserOption[]>([]);
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();

  const resetGhlState = useCallback(() => {
    setGhlConnected(false);
    setGhlLocationName("");
    setGhlFields([]);
    setGhlStages([]);
  }, []);

  const callUazap = useCallback(async (action: string, extra?: Record<string, unknown>) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/uazap-manage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ action, ...extra }),
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error || "Unknown error");
    return result.data;
  }, []);

  const callGhl = useCallback(
    async (action: string, extra?: Record<string, unknown>) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ghl-manage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action, workspace_id: activeWorkspace?.id, ...extra }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Unknown error");
      return result.data;
    },
    [activeWorkspace],
  );

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
    } catch {
      /* ignore */
    }

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

      const allFields = [...GHL_STANDARD_FIELDS, ...customFields].map((f) => {
        const saved = savedFields.find((sf: any) => sf.id === f.id);
        if (saved) {
          let mergedOptions = f.options;
          if (f.options && saved.options) {
            mergedOptions = f.options.map((opt: FieldOption) => {
              const savedOpt = saved.options?.find((so: any) => (typeof so === "string" ? so : so.value) === opt.value);
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
      const allFields = GHL_STANDARD_FIELDS.map((f) => {
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
      } catch {
        /* silent */
      }

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
            const config = (int.config as { label?: string; last_webhook_at?: string }) || {};
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
      } catch {
        /* silent */
      }

      // Fetch Stevo Oficial instances from DB
      try {
        const { data: stevoOfIntegrations } = await supabase
          .from("integrations")
          .select("*")
          .eq("type", "whatsapp_stevo_oficial")
          .eq("workspace_id", activeWorkspace.id)
          .order("created_at", { ascending: true });

        if (stevoOfIntegrations) {
          for (const int of stevoOfIntegrations) {
            const config =
              (int.config as { label?: string; last_webhook_at?: string; accessToken?: string }) || {};
            allInstances.push({
              id: int.id,
              instanceName: "",
              label: config.label || "Stevo Oficial",
              status: (int.status as WhatsAppStatus) || "disconnected",
              provider: "stevo_oficial",
              webhookUrl: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stevo-oficial-webhook?id=${int.id}`,
              lastWebhookAt: config.last_webhook_at || null,
              accessToken: config.accessToken || "",
            });
          }
        }
      } catch {
        /* silent */
      }

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
      } catch {
        /* silent */
      }
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
    const connectingInstances = instances.filter((i) => i.status === "connecting" && i.provider === "uazap");
    if (connectingInstances.length === 0) return;

    const interval = setInterval(async () => {
      for (const inst of connectingInstances) {
        try {
          const data = await callUazap("status", { integration_id: inst.id });
          if (data?.status === "connected" || data?.instance?.status === "connected") {
            setInstances((prev) =>
              prev.map((i) => (i.id === inst.id ? { ...i, status: "connected", qrCode: null } : i)),
            );
            toast({ title: `${inst.label} conectado com sucesso!` });
          } else {
            const newQr = data?.instance?.qrcode || data?.qrcode;
            if (newQr) {
              setInstances((prev) => prev.map((i) => (i.id === inst.id ? { ...i, qrCode: newQr } : i)));
            }
          }
        } catch {
          /* ignore */
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [instances, callUazap, toast]);

  const updateInstance = (id: string, updates: Partial<WhatsAppInstance>) => {
    setInstances((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));
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
        label: `Uazap #${instances.filter((i) => i.provider === "uazap").length + 1}`,
        status: "connecting",
        provider: "uazap",
        qrCode: qr || null,
      };

      if (!qr) {
        const statusData = await callUazap("status", { integration_id: newId });
        newInst.qrCode = statusData?.instance?.qrcode || statusData?.qrcode || null;
      }

      setInstances((prev) => [...prev, newInst]);
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao criar instância",
        variant: "destructive",
      });
    } finally {
      setCreatingNew(false);
    }
  };

  const handleCreateStevoInstance = async () => {
    setCreatingNew(true);
    setShowProviderPicker(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      if (!activeWorkspace) throw new Error("No active workspace");

      const { data: inserted, error } = await supabase
        .from("integrations")
        .insert({
          user_id: session.user.id,
          workspace_id: activeWorkspace.id,
          type: "whatsapp_stevo",
          config: { label: `Stevo #${instances.filter((i) => i.provider === "stevo").length + 1}` },
          status: "disconnected",
        })
        .select()
        .single();

      if (error) throw error;

      const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stevo-webhook?id=${inserted.id}`;

      setInstances((prev) => [
        ...prev,
        {
          id: inserted.id,
          instanceName: "",
          label: `Stevo #${prev.filter((i) => i.provider === "stevo").length + 1}`,
          status: "disconnected",
          provider: "stevo",
          webhookUrl,
          lastWebhookAt: null,
        },
      ]);

      toast({ title: "Instância Stevo criada!", description: "Copie o webhook e cole no Stevo." });
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao criar",
        variant: "destructive",
      });
    } finally {
      setCreatingNew(false);
    }
  };

  const handleCreateStevoOficialInstance = async () => {
    setCreatingNew(true);
    setShowProviderPicker(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      if (!activeWorkspace) throw new Error("No active workspace");

      const { data: inserted, error } = await supabase
        .from("integrations")
        .insert({
          user_id: session.user.id,
          workspace_id: activeWorkspace.id,
          type: "whatsapp_stevo_oficial",
          config: {
            label: `Stevo Oficial #${instances.filter((i) => i.provider === "stevo_oficial").length + 1}`,
          },
          status: "disconnected",
        })
        .select()
        .single();

      if (error) throw error;

      const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stevo-oficial-webhook?id=${inserted.id}`;

      setInstances((prev) => [
        ...prev,
        {
          id: inserted.id,
          instanceName: "",
          label: `Stevo Oficial #${prev.filter((i) => i.provider === "stevo_oficial").length + 1}`,
          status: "disconnected",
          provider: "stevo_oficial",
          webhookUrl,
          lastWebhookAt: null,
          accessToken: "",
        },
      ]);

      toast({
        title: "Instância Stevo Oficial criada!",
        description: "Copie o webhook e cole no Stevo API Oficial.",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao criar",
        variant: "destructive",
      });
    } finally {
      setCreatingNew(false);
    }
  };

  const handleSaveAccessToken = async (inst: WhatsAppInstance, token: string) => {
    try {
      const { data: integration } = await supabase
        .from("integrations")
        .select("config")
        .eq("id", inst.id)
        .single();
      const config = (integration?.config as Record<string, unknown>) || {};
      await supabase.from("integrations").update({ config: { ...config, accessToken: token } }).eq("id", inst.id);
      updateInstance(inst.id, { accessToken: token });
      toast({ title: "Access Token salvo!", description: "Mídias agora poderão ser baixadas." });
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao salvar token",
        variant: "destructive",
      });
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
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao reconectar",
        variant: "destructive",
      });
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
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao desconectar",
        variant: "destructive",
      });
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
      setInstances((prev) => prev.filter((i) => i.id !== inst.id));
      toast({ title: `${inst.label} removido` });
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao remover",
        variant: "destructive",
      });
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
      const { data: integration } = await supabase
        .from("integrations")
        .select("config")
        .eq("id", inst.id)
        .single();
      const config = (integration?.config as Record<string, unknown>) || {};
      await supabase.from("integrations").update({ config: { ...config, label: newLabel } }).eq("id", inst.id);
      updateInstance(inst.id, { label: newLabel });
      setEditingLabel(null);
      toast({ title: "Nome atualizado!" });
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao renomear",
        variant: "destructive",
      });
    }
  };

  const toggleField = (id: string) => {
    setGhlFields((prev) => prev.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f)));
  };

  const updateFieldDescription = (id: string, description: string) => {
    setGhlFields((prev) => prev.map((f) => (f.id === id ? { ...f, description } : f)));
  };

  const updateOptionInstruction = (fieldId: string, optionValue: string, instruction: string) => {
    setGhlFields((prev) =>
      prev.map((f) => {
        if (f.id !== fieldId || !f.options) return f;
        return {
          ...f,
          options: f.options.map((opt) => (opt.value === optionValue ? { ...opt, instruction } : opt)),
        };
      }),
    );
  };

  const toggleStage = (id: string) => {
    setGhlStages((prev) => prev.map((s) => (s.id === id ? { ...s, selected: !s.selected } : s)));
  };

  const updateStageDescription = (id: string, description: string) => {
    setGhlStages((prev) => prev.map((s) => (s.id === id ? { ...s, description } : s)));
  };

  const handleSaveMappings = async () => {
    const selectedFields = ghlFields
      .filter((f) => f.selected)
      .map((f) => ({
        id: f.id,
        fieldKey: f.fieldKey,
        name: f.name,
        dataType: f.dataType,
        description: f.description,
        options: f.options || undefined,
      }));
    const selectedStages = ghlStages
      .filter((s) => s.selected)
      .map((s) => ({
        id: s.id,
        name: s.name,
        pipelineId: s.pipelineId,
        pipelineName: s.pipelineName,
        description: s.description,
      }));
    try {
      await callGhl("save_mappings", { selectedFields, selectedStages, aiPrompt });
      toast({
        title: "Mapeamento salvo!",
        description: `${selectedFields.length} campos e ${selectedStages.length} etapas selecionados.`,
      });
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  const handleConnectGhl = async () => {
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
      toast({
        title: "Erro ao conectar",
        description: error instanceof Error ? error.message : "Verifique suas credenciais",
        variant: "destructive",
      });
    } finally {
      setLoadingGhl(false);
    }
  };

  const handleDisconnectGhl = async () => {
    setLoadingGhl(true);
    try {
      await callGhl("disconnect");
      resetGhlState();
      toast({ title: "CRM desconectado" });
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao desconectar",
        variant: "destructive",
      });
    } finally {
      setLoadingGhl(false);
    }
  };

  return (
    <div className="flex gap-6">
      <div className="space-y-6 flex-1 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Integrações</h1>
          <p className="text-muted-foreground">Gerencie suas conexões com WhatsApp e seu CRM</p>
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
                  {instances.length === 0
                    ? "Nenhum número conectado"
                    : `${instances.length} número${instances.length > 1 ? "s" : ""} configurado${
                        instances.length > 1 ? "s" : ""
                      }`}
                </p>
              </div>
            </div>
            <WhatsAppProviderPicker
              open={showProviderPicker}
              creating={creatingNew}
              onToggle={() => setShowProviderPicker(!showProviderPicker)}
              onCreateUazap={handleCreateUazapInstance}
              onCreateStevo={handleCreateStevoInstance}
              onCreateStevoOficial={handleCreateStevoOficialInstance}
            />
          </div>

          {loadingInstances ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : instances.length === 0 ? (
            <div className="bg-muted rounded-lg p-6 flex flex-col items-center gap-4">
              <Wifi className="w-12 h-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                Conecte seu WhatsApp para começar a receber e analisar mensagens automaticamente.
              </p>
              <div className="flex gap-2">
                <Button onClick={handleCreateUazapInstance} disabled={creatingNew} variant="outline">
                  Uazap (QR Code)
                </Button>
                <Button onClick={handleCreateStevoInstance} disabled={creatingNew} variant="outline">
                  Stevo (Webhook)
                </Button>
                <Button onClick={handleCreateStevoOficialInstance} disabled={creatingNew} variant="outline">
                  Stevo Oficial
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {instances.map((inst) => (
                <WhatsAppInstanceCard
                  key={inst.id}
                  inst={inst}
                  editingLabel={editingLabel}
                  editLabelValue={editLabelValue}
                  setEditingLabel={setEditingLabel}
                  setEditLabelValue={setEditLabelValue}
                  onRename={handleRenameInstance}
                  onDelete={handleDeleteInstance}
                  onReconnect={handleReconnect}
                  onDisconnect={handleDisconnect}
                  onCopy={copyToClipboard}
                  onSaveAccessToken={handleSaveAccessToken}
                />
              ))}
            </div>
          )}
        </motion.div>

        <GhlSection
          ghlConnected={ghlConnected}
          ghlLocationName={ghlLocationName}
          loadingGhl={loadingGhl}
          ghlApiKey={ghlApiKey}
          ghlLocationId={ghlLocationId}
          setGhlApiKey={setGhlApiKey}
          setGhlLocationId={setGhlLocationId}
          onConnect={handleConnectGhl}
          onDisconnect={handleDisconnectGhl}
          onReload={fetchGhlFieldsAndStages}
          loadingFields={loadingFields}
          loadingStages={loadingStages}
          ghlFields={ghlFields}
          ghlStages={ghlStages}
          toggleField={toggleField}
          updateFieldDescription={updateFieldDescription}
          updateOptionInstruction={updateOptionInstruction}
          toggleStage={toggleStage}
          updateStageDescription={updateStageDescription}
          aiPrompt={aiPrompt}
          setAiPrompt={setAiPrompt}
          onSaveMappings={handleSaveMappings}
        />

        {ghlConnected && <AiPipelineFilter />}
      </div>
      <div className="hidden xl:block w-80 shrink-0">
        <WebhookLogs />
      </div>
    </div>
  );
};

export default Integrations;
