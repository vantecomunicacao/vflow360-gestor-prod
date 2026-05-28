import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { aiConfigOptions, type AiConfigItem, type CreationConfig } from "./types";

interface AiConfigPopoverProps {
  aiConfig: Record<string, AiConfigItem>;
  creationConfig: CreationConfig;
  savingCreationConfig: boolean;
  onToggleEnabled: (key: string) => void;
  onToggleAutoApprove: (key: string) => void;
  onSaveCreationConfig: (config: CreationConfig) => void;
}

export function AiConfigPopover({
  aiConfig,
  creationConfig,
  savingCreationConfig,
  onToggleEnabled,
  onToggleAutoApprove,
  onSaveCreationConfig,
}: AiConfigPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="w-4 h-4 mr-1" /> Configurar IA
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <p className="text-sm font-semibold text-foreground mb-3">Configuração da IA</p>
        <div className="space-y-4">
          {aiConfigOptions.map(opt => (
            <div key={opt.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">{opt.label}</span>
                <Switch
                  checked={aiConfig[opt.key]?.enabled ?? true}
                  onCheckedChange={() => onToggleEnabled(opt.key)}
                />
              </div>
              {aiConfig[opt.key]?.enabled && (
                <div className="flex items-center justify-between pl-4">
                  <span className="text-xs text-muted-foreground">Auto-aprovar</span>
                  <Switch
                    checked={aiConfig[opt.key]?.autoApprove ?? false}
                    onCheckedChange={() => onToggleAutoApprove(opt.key)}
                  />
                </div>
              )}
            </div>
          ))}
          <div className="border-t border-border pt-3 mt-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Criação automática no CRM</p>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-foreground">Criar contato</span>
                <p className="text-[10px] text-muted-foreground">Se não encontrar o contato no CRM</p>
              </div>
              <Switch
                checked={creationConfig.allowCreateContact}
                disabled={savingCreationConfig}
                onCheckedChange={(v) => onSaveCreationConfig({ ...creationConfig, allowCreateContact: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-foreground">Criar oportunidade</span>
                <p className="text-[10px] text-muted-foreground">Se não encontrar oportunidade no CRM</p>
              </div>
              <Switch
                checked={creationConfig.allowCreateOpportunity}
                disabled={savingCreationConfig}
                onCheckedChange={(v) => onSaveCreationConfig({ ...creationConfig, allowCreateOpportunity: v })}
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
