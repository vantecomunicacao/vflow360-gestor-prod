import { describe, it, expect } from "vitest";

/**
 * Frontend contract test: guarantees the list of valid suggestion types
 * stays in sync with the backend and that the UI can handle them.
 */
export const VALID_SUGGESTION_TYPES = [
  "mover_funil",
  "campo_personalizado",
  "adicionar_nota",
  "valor_negociacao",
  "agendar_lembrete",
  "ganho_perdido",
] as const;

export type SuggestionType = (typeof VALID_SUGGESTION_TYPES)[number];

export const SUGGESTION_TYPE_LABELS: Record<SuggestionType, string> = {
  mover_funil: "Mover no funil",
  campo_personalizado: "Campo personalizado",
  adicionar_nota: "Adicionar nota",
  valor_negociacao: "Valor da negociação",
  agendar_lembrete: "Agendar lembrete",
  ganho_perdido: "Ganho / Perdido",
};

export const LEGACY_TYPE_MAP: Record<string, SuggestionType> = {
  "🗓️ contato futuro": "agendar_lembrete",
  field_personalizado: "campo_personalizado",
  mov_funil: "mover_funil",
};

export function normalizeSuggestionType(type: string): SuggestionType | null {
  const normalized = LEGACY_TYPE_MAP[type.toLowerCase().trim()] || type;
  return VALID_SUGGESTION_TYPES.includes(normalized as SuggestionType)
    ? (normalized as SuggestionType)
    : null;
}

describe("Suggestion type normalization (frontend contract)", () => {
  it("has exactly 6 valid types", () => {
    expect(VALID_SUGGESTION_TYPES).toHaveLength(6);
  });

  it("every valid type has a label", () => {
    for (const type of VALID_SUGGESTION_TYPES) {
      expect(SUGGESTION_TYPE_LABELS[type]).toBeDefined();
      expect(SUGGESTION_TYPE_LABELS[type]).not.toBe("");
    }
  });

  it("normalizes legacy types correctly", () => {
    expect(normalizeSuggestionType("🗓️ Contato Futuro")).toBe("agendar_lembrete");
    expect(normalizeSuggestionType("field_personalizado")).toBe("campo_personalizado");
    expect(normalizeSuggestionType("mov_funil")).toBe("mover_funil");
  });

  it("accepts all valid types as-is", () => {
    for (const type of VALID_SUGGESTION_TYPES) {
      expect(normalizeSuggestionType(type)).toBe(type);
    }
  });

  it("rejects hallucinated types", () => {
    expect(normalizeSuggestionType("✳️ Qualificando")).toBeNull();
    expect(normalizeSuggestionType("🌐 Mover para Aguardando Doc")).toBeNull();
    expect(normalizeSuggestionType("🔥 Proposta Quente")).toBeNull();
    expect(normalizeSuggestionType("inventado")).toBeNull();
    expect(normalizeSuggestionType("")).toBeNull();
  });

  it("labels are human-readable", () => {
    expect(SUGGESTION_TYPE_LABELS.mover_funil).toBe("Mover no funil");
    expect(SUGGESTION_TYPE_LABELS.campo_personalizado).toBe("Campo personalizado");
    expect(SUGGESTION_TYPE_LABELS.ganho_perdido).toBe("Ganho / Perdido");
  });
});
