-- Fase 3: gestão de membros do workspace pelo DONO (ou admin global),
-- sem exigir papel de admin. Tudo via RPC SECURITY DEFINER com guarda explícita.

-- Caller é dono do workspace OU admin global.
CREATE OR REPLACE FUNCTION public.can_manage_workspace(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.workspaces
           WHERE id = _workspace_id AND owner_id = auth.uid()
         )
      OR public.has_role(auth.uid(), 'admin');
$$;

-- Lista membros de um workspace (qualquer membro ou admin pode ver).
CREATE OR REPLACE FUNCTION public.list_workspace_members(_workspace_id uuid)
RETURNS TABLE (user_id uuid, email text, full_name text, role text, is_owner boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_workspace_member(auth.uid(), _workspace_id) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  RETURN QUERY
    SELECT wm.user_id,
           u.email::text,
           p.full_name,
           wm.role,
           (w.owner_id = wm.user_id) AS is_owner
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    LEFT JOIN auth.users u ON u.id = wm.user_id
    LEFT JOIN public.profiles p ON p.user_id = wm.user_id
    WHERE wm.workspace_id = _workspace_id
    ORDER BY (w.owner_id = wm.user_id) DESC, p.full_name NULLS LAST;
END;
$$;

-- Adiciona um usuário EXISTENTE (por e-mail) ao workspace.
CREATE OR REPLACE FUNCTION public.add_workspace_member(_workspace_id uuid, _email text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid;
BEGIN
  IF NOT public.can_manage_workspace(_workspace_id) THEN
    RAISE EXCEPTION 'Apenas o dono do workspace pode adicionar membros';
  END IF;

  SELECT id INTO _uid FROM auth.users
  WHERE lower(email) = lower(btrim(_email))
  LIMIT 1;

  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Nenhum usuário com esse e-mail. A pessoa precisa ter conta no sistema.';
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (_workspace_id, _uid, 'member')
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  RETURN _uid::text;
END;
$$;

-- Remove um membro (não permite remover o dono).
CREATE OR REPLACE FUNCTION public.remove_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_workspace(_workspace_id) THEN
    RAISE EXCEPTION 'Apenas o dono do workspace pode remover membros';
  END IF;
  IF EXISTS (SELECT 1 FROM public.workspaces WHERE id = _workspace_id AND owner_id = _user_id) THEN
    RAISE EXCEPTION 'Não é possível remover o dono do workspace';
  END IF;
  DELETE FROM public.workspace_members
  WHERE workspace_id = _workspace_id AND user_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.list_workspace_members(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_workspace_member(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_workspace_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_workspace_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_workspace_member(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_workspace_member(uuid, uuid) TO authenticated;
