import { MessageSquare, Link2, QrCode, CheckCircle, XCircle, RefreshCw, Settings, Plus, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

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

const Integrations = () => {
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [ghlConnected, setGhlConnected] = useState(false);
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

  const addCustomField = () => {
    setCustomFields(prev => [...prev, { id: crypto.randomUUID(), ghlFieldName: "", description: "" }]);
  };

  const removeCustomField = (id: string) => {
    setCustomFields(prev => prev.filter(f => f.id !== id));
  };

  const updateCustomField = (id: string, key: keyof CustomFieldMapping, value: string) => {
    setCustomFields(prev => prev.map(f => f.id === id ? { ...f, [key]: value } : f));
  };

  const addPipelineStage = () => {
    setPipelineStages(prev => [...prev, { id: crypto.randomUUID(), stageName: "", description: "" }]);
  };

  const removePipelineStage = (id: string) => {
    setPipelineStages(prev => prev.filter(s => s.id !== id));
  };

  const updatePipelineStage = (id: string, key: keyof PipelineStageMapping, value: string) => {
    setPipelineStages(prev => prev.map(s => s.id === id ? { ...s, [key]: value } : s));
  };

  const handleSaveMappings = () => {
    toast({ title: "Mapeamento salvo!", description: "A IA usará essas informações para gerar sugestões mais precisas." });
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
          <Badge variant="outline" className={whatsappConnected ? "text-success border-success/30" : "text-destructive border-destructive/30"}>
            {whatsappConnected ? <><CheckCircle className="w-3 h-3 mr-1" /> Conectado</> : <><XCircle className="w-3 h-3 mr-1" /> Desconectado</>}
          </Badge>
        </div>

        {!whatsappConnected ? (
          <div className="bg-muted rounded-lg p-6 flex flex-col items-center gap-4">
            <div className="w-48 h-48 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-3">
              <QrCode className="w-16 h-16 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">QR Code</span>
            </div>
            <Button onClick={() => { setWhatsappConnected(true); toast({ title: "WhatsApp conectado!" }); }}>
              Simular Conexão
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-1" /> Reconectar
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setWhatsappConnected(false); toast({ title: "WhatsApp desconectado" }); }}>
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

            {/* Mapeamento de Campos Personalizados */}
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
                  <motion.div
                    key={field.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-start gap-3"
                  >
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Input
                        placeholder="Nome do campo no GHL"
                        value={field.ghlFieldName}
                        onChange={(e) => updateCustomField(field.id, "ghlFieldName", e.target.value)}
                      />
                      <Input
                        placeholder="Descrição para a IA (ex: valor mensal do plano)"
                        value={field.description}
                        onChange={(e) => updateCustomField(field.id, "description", e.target.value)}
                      />
                    </div>
                    <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeCustomField(field.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <Separator />

            {/* Mapeamento de Etapas do Funil */}
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
                  <motion.div
                    key={stage.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-start gap-3"
                  >
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Input
                        placeholder="Nome da etapa (ex: Proposta Enviada)"
                        value={stage.stageName}
                        onChange={(e) => updatePipelineStage(stage.id, "stageName", e.target.value)}
                      />
                      <Input
                        placeholder="Descrição para a IA (ex: lead recebeu proposta)"
                        value={stage.description}
                        onChange={(e) => updatePipelineStage(stage.id, "description", e.target.value)}
                      />
                    </div>
                    <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removePipelineStage(stage.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <Separator />

            {/* Prompt da IA */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <h4 className="font-semibold text-foreground text-sm">Prompt da IA</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                Instruções adicionais para a IA ao analisar conversas. Os campos e etapas mapeados acima serão incluídos automaticamente.
              </p>
              <Textarea
                rows={4}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Instruções adicionais para a IA..."
                className="resize-none"
              />
            </div>

            <Button onClick={handleSaveMappings}>
              Salvar mapeamento
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Integrations;
