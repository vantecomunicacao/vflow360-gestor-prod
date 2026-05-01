import { CheckCircle, Download, Link2, Loader2, Sparkles, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { FieldOption, GhlCustomField, GhlPipelineStage } from "./types";

interface Props {
  ghlConnected: boolean;
  ghlLocationName: string;
  loadingGhl: boolean;
  ghlApiKey: string;
  ghlLocationId: string;
  setGhlApiKey: (v: string) => void;
  setGhlLocationId: (v: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onReload: () => void;
  loadingFields: boolean;
  loadingStages: boolean;
  ghlFields: GhlCustomField[];
  ghlStages: GhlPipelineStage[];
  toggleField: (id: string) => void;
  updateFieldDescription: (id: string, description: string) => void;
  updateOptionInstruction: (fieldId: string, optionValue: string, instruction: string) => void;
  toggleStage: (id: string) => void;
  updateStageDescription: (id: string, description: string) => void;
  aiPrompt: string;
  setAiPrompt: (v: string) => void;
  onSaveMappings: () => void;
}

const renderFieldRow = (
  field: GhlCustomField,
  isCustom: boolean,
  toggleField: Props["toggleField"],
  updateFieldDescription: Props["updateFieldDescription"],
  updateOptionInstruction: Props["updateOptionInstruction"],
) => (
  <div
    key={field.id}
    className={
      isCustom
        ? "flex items-start gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors"
        : "flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
    }
  >
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
        {isCustom && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
            personalizado
          </Badge>
        )}
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {field.dataType}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground font-mono">{field.fieldKey}</p>
      {field.selected && (
        <>
          <Input
            placeholder="Descreva este campo para a IA"
            value={field.description}
            onChange={(e) => updateFieldDescription(field.id, e.target.value)}
            className="text-sm"
          />
          {field.options && field.options.length > 0 && (
            <div className={`ml-2 space-y-2 border-l-2 ${isCustom ? "border-primary/20" : "border-border"} pl-3`}>
              <p className="text-xs font-medium text-muted-foreground">Opções ({field.options.length}):</p>
              {field.options.map((opt: FieldOption) => (
                <div key={opt.value} className="space-y-1">
                  <p className="text-xs font-medium text-foreground">{opt.value}</p>
                  <Input
                    placeholder={`Quando usar "${opt.value}"?`}
                    value={opt.instruction}
                    onChange={(e) => updateOptionInstruction(field.id, opt.value, e.target.value)}
                    className="text-xs h-7"
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  </div>
);

export const GhlSection = ({
  ghlConnected,
  ghlLocationName,
  loadingGhl,
  ghlApiKey,
  ghlLocationId,
  setGhlApiKey,
  setGhlLocationId,
  onConnect,
  onDisconnect,
  onReload,
  loadingFields,
  loadingStages,
  ghlFields,
  ghlStages,
  toggleField,
  updateFieldDescription,
  updateOptionInstruction,
  toggleStage,
  updateStageDescription,
  aiPrompt,
  setAiPrompt,
  onSaveMappings,
}: Props) => {
  const stdFields = ghlFields.filter((f) => f.id.startsWith("std_"));
  const customFields = ghlFields.filter((f) => !f.id.startsWith("std_"));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="glass-card p-6"
    >
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
        <Badge
          variant="outline"
          className={ghlConnected ? "text-success border-success/30" : "text-destructive border-destructive/30"}
        >
          {ghlConnected ? (
            <>
              <CheckCircle className="w-3 h-3 mr-1" /> Conectado
            </>
          ) : (
            <>
              <XCircle className="w-3 h-3 mr-1" /> Desconectado
            </>
          )}
        </Badge>
      </div>

      {!ghlConnected ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Insira seu Private Integration Token e Location ID. Encontre em: Settings → Integrations → API Keys.
          </p>
          <div className="space-y-2">
            <Label>API Key (Private Integration Token)</Label>
            <Input
              placeholder="pit-xxxxxxxx..."
              value={ghlApiKey}
              onChange={(e) => setGhlApiKey(e.target.value)}
              type="password"
            />
          </div>
          <div className="space-y-2">
            <Label>Location ID</Label>
            <Input
              placeholder="Seu Location ID"
              value={ghlLocationId}
              onChange={(e) => setGhlLocationId(e.target.value)}
            />
          </div>
          <Button onClick={onConnect} disabled={loadingGhl}>
            {loadingGhl ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Conectando...
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4 mr-1" /> Conectar
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onReload} disabled={loadingFields || loadingStages}>
              <Download className="w-4 h-4 mr-1" />{" "}
              {loadingFields || loadingStages ? "Carregando..." : "Recarregar dados"}
            </Button>
            <Button variant="outline" size="sm" disabled={loadingGhl} onClick={onDisconnect}>
              Desconectar
            </Button>
          </div>

          <Separator />

          {/* Custom Fields */}
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-foreground text-sm">Campos do CRM</h4>
              <p className="text-xs text-muted-foreground">
                Selecione os campos que a IA deve considerar e descreva o que cada um representa
              </p>
            </div>

            {loadingFields ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando campos do CRM...
              </div>
            ) : ghlFields.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Nenhum campo encontrado no CRM.</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-1">
                  Campos padrão
                </p>
                {stdFields.map((field) =>
                  renderFieldRow(field, false, toggleField, updateFieldDescription, updateOptionInstruction),
                )}

                {customFields.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-3">
                      Campos personalizados
                    </p>
                    {customFields.map((field) =>
                      renderFieldRow(field, true, toggleField, updateFieldDescription, updateOptionInstruction),
                    )}
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
              <p className="text-xs text-muted-foreground">
                Selecione as etapas que a IA deve usar e descreva quando mover o lead para cada uma
              </p>
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
                  <div
                    key={stage.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      id={`stage-${stage.id}`}
                      checked={stage.selected}
                      onCheckedChange={() => toggleStage(stage.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor={`stage-${stage.id}`}
                          className="text-sm font-medium text-foreground cursor-pointer"
                        >
                          {stage.name}
                        </label>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {stage.pipelineName}
                        </Badge>
                      </div>
                      {stage.selected && (
                        <Input
                          placeholder="Quando mover o lead para esta etapa?"
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
            <Textarea
              rows={4}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Instruções adicionais para a IA..."
              className="resize-none"
            />
          </div>

          <Button onClick={onSaveMappings}>Salvar mapeamento</Button>
        </div>
      )}
    </motion.div>
  );
};
