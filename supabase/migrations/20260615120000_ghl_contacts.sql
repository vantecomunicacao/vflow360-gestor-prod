-- Tabela de contatos do GHL — guarda os custom fields do contato (ex: UTMs),
-- que NÃO vêm na resposta de /opportunities/search. Sincronizada via
-- /contacts/?locationId (paginado). Usada como fallback na hierarquia de origem.
CREATE TABLE public.ghl_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ghl_id text NOT NULL,
  name text,
  phone text,
  email text,
  source text,
  custom_fields jsonb DEFAULT '[]'::jsonb,
  ghl_created_at timestamptz,
  ghl_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, ghl_id)
);

CREATE INDEX idx_ghl_contacts_workspace ON public.ghl_contacts(workspace_id);
CREATE INDEX idx_ghl_contacts_ghl_id ON public.ghl_contacts(workspace_id, ghl_id);

CREATE TRIGGER trg_ghl_contacts_updated BEFORE UPDATE ON public.ghl_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ghl_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view ghl_contacts" ON public.ghl_contacts FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Service role full access ghl_contacts" ON public.ghl_contacts FOR ALL TO service_role USING (true) WITH CHECK (true);
