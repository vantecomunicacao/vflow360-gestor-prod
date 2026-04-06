
-- Create workspaces table
CREATE TABLE public.workspaces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Minha Conta',
  owner_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- Create workspace_members table
CREATE TABLE public.workspace_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user is member of workspace
CREATE OR REPLACE FUNCTION public.is_workspace_member(_user_id UUID, _workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id AND workspace_id = _workspace_id
  )
$$;

-- RLS for workspaces
CREATE POLICY "Users can view workspaces they belong to"
ON public.workspaces FOR SELECT
USING (public.is_workspace_member(auth.uid(), id));

CREATE POLICY "Authenticated users can create workspaces"
ON public.workspaces FOR INSERT
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their workspaces"
ON public.workspaces FOR UPDATE
USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their workspaces"
ON public.workspaces FOR DELETE
USING (auth.uid() = owner_id);

-- RLS for workspace_members
CREATE POLICY "Members can view workspace members"
ON public.workspace_members FOR SELECT
USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace owners can manage members"
ON public.workspace_members FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.workspaces WHERE id = workspace_id AND owner_id = auth.uid()));

CREATE POLICY "Workspace owners can delete members"
ON public.workspace_members FOR DELETE
USING (EXISTS (SELECT 1 FROM public.workspaces WHERE id = workspace_id AND owner_id = auth.uid()));

CREATE POLICY "Service role full access workspaces"
ON public.workspaces FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access workspace_members"
ON public.workspace_members FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Add workspace_id to existing tables (nullable initially for migration)
ALTER TABLE public.integrations ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.conversations ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.suggestions ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.ai_config ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.ai_provider_config ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.disabled_contacts ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- Migrate existing data: create a workspace for each distinct user and assign their data
DO $$
DECLARE
  r RECORD;
  ws_id UUID;
BEGIN
  FOR r IN (
    SELECT DISTINCT user_id FROM public.integrations
    UNION SELECT DISTINCT user_id FROM public.conversations
    UNION SELECT DISTINCT user_id FROM public.ai_config
    UNION SELECT DISTINCT user_id FROM public.ai_provider_config
    UNION SELECT DISTINCT user_id FROM public.disabled_contacts
    UNION SELECT DISTINCT user_id FROM public.profiles
  ) LOOP
    INSERT INTO public.workspaces (name, owner_id) VALUES ('Minha Conta', r.user_id) RETURNING id INTO ws_id;
    INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES (ws_id, r.user_id, 'owner');
    UPDATE public.integrations SET workspace_id = ws_id WHERE user_id = r.user_id AND workspace_id IS NULL;
    UPDATE public.conversations SET workspace_id = ws_id WHERE user_id = r.user_id AND workspace_id IS NULL;
    UPDATE public.suggestions SET workspace_id = ws_id WHERE user_id = r.user_id AND workspace_id IS NULL;
    UPDATE public.ai_config SET workspace_id = ws_id WHERE user_id = r.user_id AND workspace_id IS NULL;
    UPDATE public.ai_provider_config SET workspace_id = ws_id WHERE user_id = r.user_id AND workspace_id IS NULL;
    UPDATE public.disabled_contacts SET workspace_id = ws_id WHERE user_id = r.user_id AND workspace_id IS NULL;
  END LOOP;
END $$;

-- Add triggers for updated_at
CREATE TRIGGER update_workspaces_updated_at
BEFORE UPDATE ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
