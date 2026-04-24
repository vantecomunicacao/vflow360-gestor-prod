-- Remove a permissão de criar workspaces para usuários comuns
DROP POLICY IF EXISTS "Authenticated users can create workspaces" ON public.workspaces;

-- Criar nova política: apenas admins podem criar workspaces
CREATE POLICY "Admins can create workspaces"
ON public.workspaces
FOR INSERT
TO public
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Atualizar a função create_workspace para verificar se é admin
CREATE OR REPLACE FUNCTION public.create_workspace(_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _workspace_id uuid;
  _user_id uuid := auth.uid();
  _is_admin boolean;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verificar se é admin
  _is_admin := public.has_role(_user_id, 'admin');
  
  IF NOT _is_admin THEN
    RAISE EXCEPTION 'Only admins can create workspaces';
  END IF;

  INSERT INTO public.workspaces (name, owner_id)
  VALUES (_name, _user_id)
  RETURNING id INTO _workspace_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (_workspace_id, _user_id, 'owner');

  RETURN _workspace_id;
END;
$$;