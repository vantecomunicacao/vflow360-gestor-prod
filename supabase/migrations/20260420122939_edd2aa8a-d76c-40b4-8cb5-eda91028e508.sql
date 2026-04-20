INSERT INTO public.user_permissions (user_id, view_suggestions, view_integrations, view_settings)
VALUES ('c37ffa4d-04de-4012-9eb6-fbf9b93fe28b', true, true, true)
ON CONFLICT (user_id) DO UPDATE SET view_suggestions=true, view_integrations=true, view_settings=true;