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

export interface GhlUserOption {
  ghl_id: string;
  name: string;
}
