-- Permissão "Meu desempenho".
-- Libera a tela /my-performance, que mostra ao vendedor a Qualidade de
-- Preenchimento e o Tempo Médio de Resposta APENAS das oportunidades dele.
-- O escopo é forçado no servidor (edge function `ghl-dashboard`, modo
-- view="my_performance") ao ghl_user_id do vínculo em user_ghl_links; sem
-- vínculo a tela recusa.
--
-- Admin NÃO recebe esta permissão automaticamente: quem vê a conta toda já tem
-- esses números no Dashboard, então a tela só aparece para quem o admin marcar.

ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS view_my_performance boolean NOT NULL DEFAULT false;

-- get_my_permissions ganha a coluna nova. O tipo de retorno muda, então é
-- preciso dropar antes (CREATE OR REPLACE não altera RETURNS TABLE).
DROP FUNCTION IF EXISTS public.get_my_permissions();

CREATE FUNCTION public.get_my_permissions()
RETURNS TABLE (
  view_suggestions boolean,
  view_integrations boolean,
  view_settings boolean,
  view_all_cooling_leads boolean,
  view_my_performance boolean,
  is_admin boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  admin_flag boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN QUERY SELECT false, false, false, false, false, false;
    RETURN;
  END IF;

  admin_flag := public.has_role(uid, 'admin');

  IF admin_flag THEN
    -- view_my_performance fica false para admin (ver comentário no topo).
    RETURN QUERY SELECT true, true, true, true, false, true;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      COALESCE(p.view_suggestions, false),
      COALESCE(p.view_integrations, false),
      COALESCE(p.view_settings, false),
      COALESCE(p.view_all_cooling_leads, false),
      COALESCE(p.view_my_performance, false),
      false
    FROM (SELECT 1) AS dummy
    LEFT JOIN public.user_permissions p ON p.user_id = uid;
END;
$$;

-- O DROP derruba os GRANTs da função antiga; repõe o acesso de quem chama pelo app.
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;
