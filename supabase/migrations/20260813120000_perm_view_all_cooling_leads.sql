-- Permissão "ver leads esfriando de toda a conta".
-- Sem ela, quem tem vínculo em user_ghl_links (vendedor) enxerga apenas as
-- próprias oportunidades na tela de leads esfriando — o escopo é forçado no
-- servidor pela edge function `ghl-cooling-leads`. Com ela, o usuário vê a
-- conta inteira e ganha o filtro por vendedor.

ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS view_all_cooling_leads boolean NOT NULL DEFAULT false;

-- get_my_permissions ganha a coluna nova. O tipo de retorno muda, então é
-- preciso dropar antes (CREATE OR REPLACE não altera RETURNS TABLE).
DROP FUNCTION IF EXISTS public.get_my_permissions();

CREATE FUNCTION public.get_my_permissions()
RETURNS TABLE (
  view_suggestions boolean,
  view_integrations boolean,
  view_settings boolean,
  view_all_cooling_leads boolean,
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
    RETURN QUERY SELECT false, false, false, false, false;
    RETURN;
  END IF;

  admin_flag := public.has_role(uid, 'admin');

  IF admin_flag THEN
    RETURN QUERY SELECT true, true, true, true, true;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      COALESCE(p.view_suggestions, false),
      COALESCE(p.view_integrations, false),
      COALESCE(p.view_settings, false),
      COALESCE(p.view_all_cooling_leads, false),
      false
    FROM (SELECT 1) AS dummy
    LEFT JOIN public.user_permissions p ON p.user_id = uid;
END;
$$;
