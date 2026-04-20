-- User-level permissions (global per user)
CREATE TABLE IF NOT EXISTS public.user_permissions (
  user_id uuid PRIMARY KEY,
  view_suggestions boolean NOT NULL DEFAULT false,
  view_integrations boolean NOT NULL DEFAULT false,
  view_settings boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own permissions"
  ON public.user_permissions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all permissions"
  ON public.user_permissions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert permissions"
  ON public.user_permissions FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update permissions"
  ON public.user_permissions FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete permissions"
  ON public.user_permissions FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access user_permissions"
  ON public.user_permissions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_user_permissions_updated_at
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper that returns the current user's effective permissions (admin = all true)
CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE (
  view_suggestions boolean,
  view_integrations boolean,
  view_settings boolean,
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
    RETURN QUERY SELECT false, false, false, false;
    RETURN;
  END IF;

  admin_flag := public.has_role(uid, 'admin');

  IF admin_flag THEN
    RETURN QUERY SELECT true, true, true, true;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      COALESCE(p.view_suggestions, false),
      COALESCE(p.view_integrations, false),
      COALESCE(p.view_settings, false),
      false
    FROM (SELECT 1) AS dummy
    LEFT JOIN public.user_permissions p ON p.user_id = uid;
END;
$$;