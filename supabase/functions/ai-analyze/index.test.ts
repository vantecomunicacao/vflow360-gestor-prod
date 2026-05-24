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

Deno.test("resolveAiModel: global key (no user provider) uses gpt-4o-mini", () => {
  const result = resolveAiModel({ provider: "other", api_key: undefined, model: undefined });
  assertEquals(result.useOpenAI, false);
  assertEquals(result.model, "gpt-4o-mini");
  assertEquals(result.providerLabel, "openai");
});

Deno.test("resolveAiModel: global key when no provider config", () => {
  const result = resolveAiModel(null);
  assertEquals(result.useOpenAI, false);
  assertEquals(result.model, "gpt-4o-mini");
  assertEquals(result.providerLabel, "openai");
});

Deno.test("resolveAiModel: OpenAI without api_key falls back to global key", () => {
  const result = resolveAiModel({ provider: "openai", api_key: "", model: "gpt-4o" });
  assertEquals(result.useOpenAI, false);
  assertEquals(result.model, "gpt-4o-mini");
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

Deno.test("buildAiProviderString: global key defaults to gpt-4o-mini", () => {
  const resolved = resolveAiModel(null);
  const str = buildAiProviderString(null, resolved);
  assertEquals(str, "openai/gpt-4o-mini");
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
