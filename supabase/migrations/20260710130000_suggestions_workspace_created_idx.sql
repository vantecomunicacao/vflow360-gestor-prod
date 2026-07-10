-- Índice para a listagem de sugestões por workspace na janela de 30 dias.
-- O hook use-suggestions passou a filtrar por (workspace_id, created_at >= now-30d)
-- ordenando por created_at desc. Hoje a tabela é pequena (~2k linhas) e o scan é
-- trivial, mas este índice mantém a query O(log n) conforme o volume cresce
-- (workspaces de alto volume ~16 sugestões/dia).
-- CONCURRENTLY para não travar escrita; por isso não roda em transação.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_suggestions_workspace_created
  ON public.suggestions (workspace_id, created_at DESC);
