export interface FieldOption {
  value: string;
  instruction: string;
}

export interface GhlCustomField {
  id: string;
  name: string;
  fieldKey: string;
  dataType: string;
  selected: boolean;
  description: string;
  options?: FieldOption[];
}

export interface GhlPipelineStage {
  id: string;
  name: string;
  pipelineId: string;
  pipelineName: string;
  selected: boolean;
  description: string;
}

export type WhatsAppStatus = "not_created" | "disconnected" | "connecting" | "connected";
export type WhatsAppProvider = "uazap" | "stevo" | "stevo_oficial";

export interface WhatsAppInstance {
  id: string;
  instanceName: string;
  label: string;
  status: WhatsAppStatus;
  provider: WhatsAppProvider;
  qrCode?: string | null;
  loading?: boolean;
  webhookUrl?: string;
  lastWebhookAt?: string | null;
  accessToken?: string;
  ghlUserId?: string | null;
}

export interface GhlUserOption {
  ghl_id: string;
  name: string;
}
