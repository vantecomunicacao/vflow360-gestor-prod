-- OpenAI passa a ser o provedor de IA padrão (Lovable AI foi removido do sistema).
-- A coluna provider continua livre: 'openai' (com api_key próprio) ou sem chave
-- (usa a chave global OPENAI_API_KEY, exibido como "gerenciado" na UI).

ALTER TABLE public.ai_provider_config
  ALTER COLUMN provider SET DEFAULT 'openai';

-- Normaliza configurações legadas que apontavam para o Lovable.
UPDATE public.ai_provider_config
  SET provider = 'openai'
  WHERE provider = 'lovable' OR provider IS NULL;
