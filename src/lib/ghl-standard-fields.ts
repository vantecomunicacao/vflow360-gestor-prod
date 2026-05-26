import type { GhlCustomField } from "@/components/integrations/types";

export const GHL_STANDARD_FIELDS: GhlCustomField[] = [
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
