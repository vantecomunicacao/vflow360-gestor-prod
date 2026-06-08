import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { GhlSection } from "@/components/integrations/GhlSection";
import { AiPipelineFilter } from "@/components/integrations/AiPipelineFilter";
import { AiAnalystConfig } from "@/components/integrations/AiAnalystConfig";
import { callEdge } from "@/lib/edgeClient";
import { GHL_STANDARD_FIELDS } from "@/lib/ghl-standard-fields";
import { FieldOption, GhlCustomField, GhlPipelineStage } from "@/components/integrations/types";

const Integrations = () => {
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
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();

  const resetGhlState = useCallback(() => {
    setGhlConnected(false);
    setGhlLocationName("");
    setGhlFields([]);
    setGhlStages([]);
  }, []);

  const callGhl = useCallback(
    (action: string, extra?: Record<string, unknown>) =>
      callEdge<any>("ghl-manage", { action, workspace_id: activeWorkspace?.id, ...extra }),
    [activeWorkspace],
  );

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

  // Check GHL connection status on mount
  useEffect(() => {
    if (!activeWorkspace) return;
    const checkStatus = async () => {
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
  }, [activeWorkspace, callGhl, resetGhlState]);

  useEffect(() => {
    if (ghlConnected) {
      fetchGhlFieldsAndStages();
    }
  }, [ghlConnected, fetchGhlFieldsAndStages]);

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
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integrações</h1>
        <p className="text-muted-foreground">Gerencie a conexão com seu CRM</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
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
      </motion.div>

      {ghlConnected && <AiPipelineFilter />}
      {ghlConnected && <AiAnalystConfig />}
    </div>
  );
};

export default Integrations;
