import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildAiProviderString,
  LEGACY_TYPE_MAP,
  normalizeSuggestionType,
  resolveAiModel,
  VALID_SUGGESTION_TYPES,
} from "./index.ts";

// =====================
// resolveAiModel
// =====================
Deno.test("resolveAiModel: OpenAI with explicit model", () => {
  const result = resolveAiModel({ provider: "openai", api_key: "sk-xxx", model: "gpt-4o" });
  assertEquals(result.useOpenAI, true);
  assertEquals(result.model, "gpt-4o");
  assertEquals(result.providerLabel, "openai");
});

Deno.test("resolveAiModel: OpenAI without model falls back to gpt-4o-mini", () => {
  const result = resolveAiModel({ provider: "openai", api_key: "sk-xxx", model: undefined });
  assertEquals(result.useOpenAI, true);
  assertEquals(result.model, "gpt-4o-mini");
  assertEquals(result.providerLabel, "openai");
});

Deno.test("resolveAiModel: OpenAI with null model falls back to gpt-4o-mini", () => {
  const result = resolveAiModel({ provider: "openai", api_key: "sk-xxx", model: null as any });
  assertEquals(result.useOpenAI, true);
  assertEquals(result.model, "gpt-4o-mini");
});

Deno.test("resolveAiModel: Lovable AI when provider is lovable", () => {
  const result = resolveAiModel({ provider: "lovable", api_key: null, model: null });
  assertEquals(result.useOpenAI, false);
  assertEquals(result.model, "google/gemini-2.5-flash");
  assertEquals(result.providerLabel, "lovable");
});

Deno.test("resolveAiModel: Lovable AI when no provider config", () => {
  const result = resolveAiModel(null);
  assertEquals(result.useOpenAI, false);
  assertEquals(result.model, "google/gemini-2.5-flash");
  assertEquals(result.providerLabel, "lovable");
});

Deno.test("resolveAiModel: OpenAI without api_key falls back to Lovable", () => {
  const result = resolveAiModel({ provider: "openai", api_key: "", model: "gpt-4o" });
  assertEquals(result.useOpenAI, false);
  assertEquals(result.model, "google/gemini-2.5-flash");
});

// =====================
// buildAiProviderString
// =====================
Deno.test("buildAiProviderString: OpenAI with explicit model", () => {
  const resolved = resolveAiModel({ provider: "openai", api_key: "sk-xxx", model: "gpt-4o" });
  const str = buildAiProviderString({ model: "gpt-4o" }, resolved);
  assertEquals(str, "openai/gpt-4o");
});

Deno.test("buildAiProviderString: OpenAI fallback to gpt-4o-mini", () => {
  const resolved = resolveAiModel({ provider: "openai", api_key: "sk-xxx", model: undefined });
  const str = buildAiProviderString({ model: undefined }, resolved);
  assertEquals(str, "openai/gpt-4o-mini");
});

Deno.test("buildAiProviderString: Lovable AI", () => {
  const resolved = resolveAiModel(null);
  const str = buildAiProviderString(null, resolved);
  assertEquals(str, "lovable/google/gemini-2.5-flash");
});

// =====================
// normalizeSuggestionType
// =====================
Deno.test("normalizeSuggestionType: accepts all valid types", () => {
  for (const type of VALID_SUGGESTION_TYPES) {
    assertEquals(normalizeSuggestionType(type), type);
  }
});

Deno.test("normalizeSuggestionType: normalizes legacy types", () => {
  assertEquals(normalizeSuggestionType("🗓️ Contato Futuro"), "agendar_lembrete");
  assertEquals(normalizeSuggestionType("field_personalizado"), "campo_personalizado");
  assertEquals(normalizeSuggestionType("mov_funil"), "mover_funil");
});

Deno.test("normalizeSuggestionType: rejects unknown/hallucinated types", () => {
  assertEquals(normalizeSuggestionType("✳️ Qualificando"), null);
  assertEquals(normalizeSuggestionType("🌐 Mover para Aguardando Doc"), null);
  assertEquals(normalizeSuggestionType("🔥 Proposta Quente"), null);
  assertEquals(normalizeSuggestionType("inventado_pelo_modelo"), null);
  assertEquals(normalizeSuggestionType(""), null);
});

Deno.test("normalizeSuggestionType: is case-insensitive for legacy map", () => {
  assertEquals(normalizeSuggestionType("FIELD_PERSONALIZADO"), "campo_personalizado");
  assertEquals(normalizeSuggestionType("  mov_funil  "), "mover_funil");
});

Deno.test("LEGACY_TYPE_MAP covers all historically bad types", () => {
  // Ensure the map keys are lowercase for case-insensitive matching
  for (const key of Object.keys(LEGACY_TYPE_MAP)) {
    assertEquals(key, key.toLowerCase(), `Legacy key "${key}" must be lowercase`);
  }
});
