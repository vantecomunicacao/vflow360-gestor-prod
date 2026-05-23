-- (local) Inserção condicional: só aplica se o usuário existir (evita quebra no Supabase local)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = 'c37ffa4d-04de-4012-9eb6-fbf9b93fe28b') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES ('c37ffa4d-04de-4012-9eb6-fbf9b93fe28b', 'admin')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.user_permissions (user_id, view_suggestions, view_integrations, view_settings)
    VALUES ('c37ffa4d-04de-4012-9eb6-fbf9b93fe28b', true, true, true)
    ON CONFLICT (user_id) DO UPDATE SET view_suggestions=true, view_integrations=true, view_settings=true;
  END IF;
END $$;
