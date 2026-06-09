-- C1 (AI_DECISIONS #2): versionar o prompt nas sugestoes de conversa.
-- Espelha ai_insights.prompt_version (migration 20260607140000). Nullable:
-- sugestoes antigas ficam null (= geradas antes do versionamento), sem backfill.

alter table public.suggestions
  add column if not exists prompt_version text;

comment on column public.suggestions.prompt_version is
  'Versao do prompt/guardrails que gerou a sugestao (ai-analyze-v2). Rastreabilidade p/ aprendizado offline — AI_DECISIONS #2. Espelha ai_insights.prompt_version.';
