import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  DollarSign,
  ExternalLink,
  GitBranch,
  Loader2,
  MessageSquare,
  UserCheck,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACTION_TYPE_LABELS,
  typeColors,
  type ExecutionResult,
  type LostReason,
  type Suggestion,
} from "./types";

interface SuggestionCardProps {
  suggestion: Suggestion;
  index: number;
  executionResult?: ExecutionResult;
  isExecuting: boolean;
  /** True if any suggestion (this one or another) is currently executing — disables Reject. */
  anyExecuting: boolean;
  lostReasons: LostReason[];
  selectedLostReason?: string;
  onSelectLostReason: (reasonId: string) => void;
  onApprove: () => void;
  onReject: () => void;
}

export function SuggestionCard({
  suggestion,
  index,
  executionResult,
  isExecuting,
  anyExecuting,
  lostReasons,
  selectedLostReason,
  onSelectLostReason,
  onApprove,
  onReject,
}: SuggestionCardProps) {
  const ad = suggestion.action_data;
  const isLost =
    suggestion.type === "ganho_perdido" &&
    !(ad?.value || "").toLowerCase().includes("ganh");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="glass-card p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge variant="outline" className={typeColors[suggestion.type] || ""}>
              {ACTION_TYPE_LABELS[suggestion.type] || suggestion.type}
            </Badge>
            {suggestion.ai_provider && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                {suggestion.ai_provider.startsWith("openai") ? "🤖 OpenAI" : "✨ IA (legado)"}
                {suggestion.ai_provider.includes("/") && (
                  <span className="ml-1 opacity-60">{suggestion.ai_provider.split("/").pop()}</span>
                )}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {new Date(suggestion.created_at).toLocaleString("pt-BR")}
            </span>
            {suggestion.status !== "pending" && (
              <Badge variant={suggestion.status === "approved" ? "default" : "destructive"}>
                {suggestion.status === "approved" ? "Aprovada" : "Rejeitada"}
              </Badge>
            )}
            {suggestion.status === "pending" && ad?.auto_approve_error && (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                <AlertTriangle className="w-3 h-3 mr-1" /> Auto-aprovação falhou
              </Badge>
            )}
            {suggestion.status === "approved" && ad?.not_found_contact && (
              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                <AlertTriangle className="w-3 h-3 mr-1" /> Contato não encontrado
              </Badge>
            )}
            {suggestion.status === "approved" && ad?.not_found_opportunity && (
              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                <AlertTriangle className="w-3 h-3 mr-1" /> Oportunidade não encontrada
              </Badge>
            )}
            {suggestion.status === "approved" &&
              (executionResult || ad?.executed) &&
              !ad?.not_found_contact &&
              !ad?.not_found_opportunity && (
                <>
                  {(executionResult?.contactCreated || ad?.contact_created) && (
                    <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                      👤 Contato criado
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className={
                      executionResult?.opportunityCreated || ad?.opportunity_created
                        ? "bg-success/10 text-success border-success/20"
                        : "bg-info/10 text-info border-info/20"
                    }
                  >
                    {executionResult?.opportunityCreated || ad?.opportunity_created
                      ? "🆕 Oportunidade criada"
                      : "📌 Oportunidade existente"}
                  </Badge>
                </>
              )}
          </div>

          <h4 className="text-sm font-semibold text-foreground mb-2">{suggestion.title}</h4>

          {(ad?.field || ad?.value) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
              {ad?.field && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Campo</p>
                  <p className="text-sm text-foreground font-medium">{ad.field}</p>
                </div>
              )}
              {ad?.value && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Valor sugerido</p>
                  <p className="text-sm text-primary font-semibold flex items-center gap-1">
                    <ArrowRight className="w-3 h-3" /> {ad.value}
                  </p>
                </div>
              )}
            </div>
          )}

          {suggestion.description && (
            <div className="bg-muted/50 rounded-lg p-3 mb-2">
              <div className="flex items-start gap-2">
                <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-foreground">{suggestion.description}</p>
              </div>
            </div>
          )}

          {ad?.auto_approve_error && suggestion.status === "pending" && (
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 mb-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-destructive mb-0.5">Erro na auto-aprovação</p>
                  <p className="text-xs text-destructive/80">{ad.auto_approve_error}</p>
                  {ad.auto_approve_failed_at && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(ad.auto_approve_failed_at).toLocaleString("pt-BR")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {suggestion.status === "approved" && (ad?.not_found_contact || ad?.not_found_opportunity) && (
            <div className="bg-warning/5 border border-warning/20 rounded-lg p-3 mb-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-warning mb-0.5">
                    {ad.not_found_contact ? "Contato não encontrado no CRM" : "Oportunidade não encontrada no CRM"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ad.not_found_contact
                      ? "A criação automática de contatos está desativada. Crie o contato manualmente ou ative a criação em Configurar IA."
                      : "A criação automática de oportunidades está desativada. Crie a oportunidade manualmente ou ative a criação em Configurar IA."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {suggestion.status === "approved" && ad?.executed && (
            <div className="bg-muted/30 border border-border rounded-lg p-3 mb-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                {ad.ghl_assigned_to && (
                  <span className="flex items-center gap-1 text-foreground">
                    <UserCheck className="w-3.5 h-3.5 text-primary" />
                    <span className="text-muted-foreground">Responsável:</span>
                    <span className="font-medium">{ad.ghl_assigned_to}</span>
                  </span>
                )}
                {ad.ghl_pipeline_name && (
                  <span className="flex items-center gap-1 text-foreground">
                    <GitBranch className="w-3.5 h-3.5 text-primary" />
                    <span className="text-muted-foreground">Funil:</span>
                    <span className="font-medium">{ad.ghl_pipeline_name}</span>
                    {ad.ghl_stage_name && (
                      <span className="text-muted-foreground">→ {ad.ghl_stage_name}</span>
                    )}
                  </span>
                )}
                {ad.ghl_monetary_value != null && ad.ghl_monetary_value > 0 && (
                  <span className="flex items-center gap-1 text-foreground">
                    <DollarSign className="w-3.5 h-3.5 text-primary" />
                    <span className="text-muted-foreground">Valor:</span>
                    <span className="font-medium">
                      R$ {Number(ad.ghl_monetary_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </span>
                )}
                {(ad.ghl_opportunity_name || ad.contact_name) && ad.ghl_opportunity_id && ad.ghl_location_id ? (
                  <a
                    href={`https://app.gohighlevel.com/v2/location/${ad.ghl_location_id}/opportunities/list?opportunityId=${ad.ghl_opportunity_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-foreground hover:text-primary transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-muted-foreground">Oportunidade:</span>
                    <span className="font-medium underline underline-offset-2">
                      {ad.ghl_opportunity_name || ad.contact_name}
                    </span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </a>
                ) : (
                  ad.ghl_opportunity_name && (
                    <span className="flex items-center gap-1 text-foreground">
                      <span className="text-muted-foreground">Oportunidade:</span>
                      <span className="font-medium">{ad.ghl_opportunity_name}</span>
                    </span>
                  )
                )}
                {ad.executed_at && (
                  <span className="flex items-center gap-1 text-muted-foreground ml-auto">
                    <Clock className="w-3 h-3" />
                    {new Date(ad.executed_at).toLocaleString("pt-BR")}
                  </span>
                )}
              </div>
              {ad.execution_result && (
                <p className="text-xs text-muted-foreground mt-1.5 pt-1.5 border-t border-border">
                  ✅ {ad.execution_result}
                </p>
              )}
            </div>
          )}

          {suggestion.status === "pending" && isLost && lostReasons.length > 0 && (
            <div className="mb-3 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
              <label className="text-xs font-semibold text-destructive mb-1.5 block">
                Motivo de perda {(ad as any)?.lostReasonId ? "(sugerido pela IA ✨)" : "(obrigatório)"}
              </label>
              <Select
                value={selectedLostReason || ""}
                onValueChange={onSelectLostReason}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Selecione o motivo..." />
                </SelectTrigger>
                <SelectContent>
                  {lostReasons.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}{" "}
                      <span className="text-muted-foreground text-xs ml-1">({r.pipelineName})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {suggestion.status === "pending" && (
            <div className="flex gap-2">
              <Button size="sm" onClick={onApprove} disabled={isExecuting}>
                {isExecuting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Executando...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-1" /> Aprovar e Executar
                  </>
                )}
              </Button>
              <Button size="sm" variant="outline" onClick={onReject} disabled={anyExecuting}>
                <X className="w-4 h-4 mr-1" /> Rejeitar
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
