// Resolucao do provider/modelo/chave de IA por workspace.
//
// Extraido de ai-analyze-v2 (provider config do owner + fallback OPENAI_API_KEY).
// Regra do projeto: trabalho comum vive em _shared/ e e INLINED (import direto),
// nunca chamado via HTTP edge->edge.
//
// Hoje so ha um provider real (OpenAI). A funcao mantem a forma generica para
// quando houver outro, mas sempre resolve para o endpoint/label da OpenAI.

export interface AiProviderConfigRow {
  provider?: string;
  api_key?: string;
  model?: string;
}

export interface ResolvedAiProvider {
  useOpenAI: boolean;
  model: string;
  providerLabel: string;
  apiKey: string;
  endpoint: string;
}

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";

// Le ai_provider_config do owner do workspace e resolve a chave/modelo a usar.
// Lanca se nao houver nenhuma chave (nem do workspace nem global).
export async function resolveAiProvider(
  supabase: any,
  ownerUserId: string,
  globalApiKey?: string | null,
): Promise<ResolvedAiProvider> {
  const { data: providerConfig } = await supabase
    .from("ai_provider_config")
    .select("provider, api_key, model")
    .eq("user_id", ownerUserId)
    .maybeSingle();

  const cfg = (providerConfig || null) as AiProviderConfigRow | null;
  const useOpenAI = cfg?.provider === "openai" && !!cfg?.api_key;
  const model = (useOpenAI ? cfg?.model : null) || DEFAULT_MODEL;
  const apiKey = (useOpenAI ? cfg!.api_key : globalApiKey) || "";

  if (!apiKey) {
    throw new Error(
      "No OpenAI API key configured. Set OPENAI_API_KEY or configure a provider in Settings.",
    );
  }

  return {
    useOpenAI: !!useOpenAI,
    model,
    providerLabel: "openai",
    apiKey,
    endpoint: OPENAI_ENDPOINT,
  };
}

// String de versao do provider gravada junto com a saida (ex: "openai/gpt-4o-mini").
export function aiProviderString(resolved: ResolvedAiProvider): string {
  return `${resolved.providerLabel}/${resolved.model}`;
}
