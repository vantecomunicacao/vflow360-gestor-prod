---
name: AI Motor Rules
description: Debounce, message context window, and similarity filter for the AI suggestions engine
type: feature
---

# AI Motor Rules

- **Debounce**: 8 min after each new message, with a 20 min ceiling (cap from first message in burst). Configured in `stevo-webhook` and `stevo-oficial-webhook` via `DEBOUNCE_MS` / `CEILING_MS`.
- **Context window**: last **20 messages** of the conversation (descending fetch + reverse for chronological order) — `ai-analyze/index.ts`.
- **Previous suggestions context**: last **5** suggestions sent to the model to avoid duplicates.
- **Similarity filter**: suggestions with >60% similarity to a recent one are deduplicated.
- **Default OpenAI model**: `gpt-4o-mini` (when user picks OpenAI provider without choosing a specific model). Lovable AI default remains `google/gemini-2.5-flash`.

**Why**: token cost optimization — prior config (4/10 min, 50 msgs, 20 prev suggestions, gpt-4o) was overspending on OpenAI.
