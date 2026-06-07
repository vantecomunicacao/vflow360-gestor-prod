export type SuggestionStatus = "pending" | "approved" | "rejected";

export interface Suggestion {
  id: string;
  type: string;
  title: string;
  description: string | null;
  status: SuggestionStatus;
  action_data: {
    field?: string;
    value?: string;
    contact_name?: string;
    contact_phone?: string;
    auto_approve_error?: string;
    auto_approve_failed_at?: string;
    executed?: boolean;
    execution_result?: string;
    ghl_assigned_to?: string;
    ghl_opportunity_name?: string;
    ghl_pipeline_name?: string;
    ghl_stage_name?: string;
    ghl_monetary_value?: number;
    ghl_opportunity_status?: string;
    ghl_opportunity_id?: string;
    ghl_location_id?: string;
    opportunity_created?: boolean;
    contact_created?: boolean;
    executed_at?: string;
    not_found_contact?: boolean;
    not_found_opportunity?: boolean;
  };
  created_at: string;
  conversation_id: string | null;
  ai_provider: string | null;
  ghl_conversations?: { channel_type: string | null } | null;
}

export interface ContactGroup {
  key: string;
  contactName: string;
  contactPhone: string;
  suggestions: Suggestion[];
  pendingCount: number;
  integrationLabel: string | null;
  createdAt: string | null;
  lastApprovedAt: string | null;
  lastAssignedTo: string | null;
  actionSummary: { type: string; count: number }[];
}

export interface LostReason {
  id: string;
  name: string;
  pipelineId: string;
  pipelineName: string;
}

export interface ExecutionResult {
  opportunityCreated: boolean;
  contactCreated: boolean;
  message: string;
}

export interface AiConfigItem {
  enabled: boolean;
  autoApprove: boolean;
}

export interface CreationConfig {
  allowCreateContact: boolean;
  allowCreateOpportunity: boolean;
}

export const ACTION_TYPE_LABELS: Record<string, string> = {
  mover_funil: "Mover funil",
  campo_personalizado: "Preencher campo",
  adicionar_nota: "Adicionar nota",
  valor_negociacao: "Atualizar valor",
  agendar_lembrete: "Agendar lembrete",
  ganho_perdido: "Marcar resultado",
};

export const typeColors: Record<string, string> = {
  mover_funil: "bg-success/10 text-success border-success/20",
  campo_personalizado: "bg-primary/10 text-primary border-primary/20",
  adicionar_nota: "bg-warning/10 text-warning border-warning/20",
  valor_negociacao: "bg-info/10 text-info border-info/20",
  agendar_lembrete: "bg-accent/10 text-accent-foreground border-accent/20",
  ganho_perdido: "bg-destructive/10 text-destructive border-destructive/20",
};

export const suggestionTypeOptions = [
  { key: "mover_funil", label: "Mover funil" },
  { key: "campo_personalizado", label: "Preencher campo personalizado" },
  { key: "adicionar_nota", label: "Adicionar nota" },
  { key: "valor_negociacao", label: "Valor da negociação R$" },
  { key: "agendar_lembrete", label: "Agendar lembrete" },
  { key: "ganho_perdido", label: "Marcar como ganho ou perdido" },
];

// "ganho_perdido" is split into two independent toggles in the AI config UI.
export const aiConfigOptions = [
  { key: "mover_funil", label: "Mover funil" },
  { key: "campo_personalizado", label: "Preencher campo personalizado" },
  { key: "adicionar_nota", label: "Adicionar nota" },
  { key: "valor_negociacao", label: "Valor da negociação R$" },
  { key: "agendar_lembrete", label: "Agendar lembrete" },
  { key: "marcar_ganho", label: "Marcar como ganho" },
  { key: "marcar_perdido", label: "Marcar como perdido" },
];
