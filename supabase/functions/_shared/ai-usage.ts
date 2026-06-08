// Log de custo de IA -> ai_usage_log.
//
// Extraido de ai-analyze-v2 (tabela de precos por modelo + insert). Centraliza
// o calculo de custo para que toda function que chama LLM logue do mesmo jeito.
// Nunca lanca: falha de log nao deve derrubar a operacao principal.

// Preco por 1M de tokens (USD), por modelo.
const PRICING: Record<string, { in: number; out: number }> = {
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4-turbo": { in: 10, out: 30 },
  "gpt-3.5-turbo": { in: 0.5, out: 1.5 },
};

export interface LogUsageArgs {
  workspaceId: string;
  userId: string | null;
  model: string;
  provider?: string;
  // usage cru da resposta da OpenAI ({ prompt_tokens, completion_tokens, total_tokens })
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null | undefined;
  // contexto opcional para rastreio
  conversationId?: string | null;
}

export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const pr = PRICING[model] || { in: 0, out: 0 };
  return (promptTokens * pr.in + completionTokens * pr.out) / 1_000_000;
}

export async function logAiUsage(supabase: any, args: LogUsageArgs): Promise<void> {
  try {
    const u = args.usage || {};
    const promptTokens = Number(u.prompt_tokens || 0);
    const completionTokens = Number(u.completion_tokens || 0);
    const totalTokens = Number(u.total_tokens || promptTokens + completionTokens);
    const costUsd = estimateCostUsd(args.model, promptTokens, completionTokens);

    await supabase.from("ai_usage_log").insert({
      workspace_id: args.workspaceId,
      user_id: args.userId,
      conversation_id: args.conversationId ?? null,
      provider: args.provider || "openai",
      model: args.model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      cost_usd: Number(costUsd.toFixed(6)),
    });
  } catch (e) {
    console.error("Failed to log AI usage:", e);
  }
}
