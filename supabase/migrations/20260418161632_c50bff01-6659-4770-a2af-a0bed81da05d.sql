-- ===== Fase 1: Tabelas de snapshot do GHL para o Dashboard VFlowGHL =====

-- 1. Pipelines do GHL
CREATE TABLE public.ghl_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ghl_id text NOT NULL,
  name text NOT NULL,
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, ghl_id)
);

-- 2. Usuários (vendedores) do GHL
CREATE TABLE public.ghl_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ghl_id text NOT NULL,
  name text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, ghl_id)
);

-- 3. Custom fields do GHL (definição)
CREATE TABLE public.ghl_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ghl_id text NOT NULL,
  name text NOT NULL,
  field_key text,
  model text,
  data_type text,
  picklist_options jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, ghl_id)
);

-- 4. Lost reasons do GHL
CREATE TABLE public.ghl_loss_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ghl_id text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, ghl_id)
);

-- 5. Opportunities do GHL (entidade central do dashboard)
CREATE TABLE public.ghl_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ghl_id text NOT NULL,
  name text,
  pipeline_id text,
  stage_id text,
  status text,
  monetary_value numeric,
  source text,
  contact_id text,
  contact_name text,
  contact_phone text,
  contact_email text,
  assigned_to text,
  lost_reason_id text,
  custom_fields jsonb DEFAULT '{}'::jsonb,
  ghl_created_at timestamptz,
  ghl_updated_at timestamptz,
  last_status_change_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, ghl_id)
);

CREATE INDEX idx_ghl_opportunities_workspace ON public.ghl_opportunities(workspace_id);
CREATE INDEX idx_ghl_opportunities_pipeline ON public.ghl_opportunities(workspace_id, pipeline_id);
CREATE INDEX idx_ghl_opportunities_stage ON public.ghl_opportunities(workspace_id, stage_id);
CREATE INDEX idx_ghl_opportunities_assigned ON public.ghl_opportunities(workspace_id, assigned_to);
CREATE INDEX idx_ghl_opportunities_created ON public.ghl_opportunities(workspace_id, ghl_created_at DESC);
CREATE INDEX idx_ghl_opportunities_status ON public.ghl_opportunities(workspace_id, status);

-- 6. Status do último sync por workspace
CREATE TABLE public.ghl_sync_status (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  last_sync_duration_ms integer,
  opportunities_count integer DEFAULT 0,
  is_running boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Configurações do dashboard por workspace
CREATE TABLE public.ghl_dashboard_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  default_pipeline_ids text[] DEFAULT '{}',
  visible_custom_fields text[] DEFAULT '{}',
  origin_field_name text,
  additional_date_field text,
  funnel_stage_mapping jsonb,
  won_stage_keys text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ====== Triggers updated_at ======
CREATE TRIGGER trg_ghl_pipelines_updated BEFORE UPDATE ON public.ghl_pipelines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ghl_users_updated BEFORE UPDATE ON public.ghl_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ghl_custom_fields_updated BEFORE UPDATE ON public.ghl_custom_fields FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ghl_loss_reasons_updated BEFORE UPDATE ON public.ghl_loss_reasons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ghl_opportunities_updated BEFORE UPDATE ON public.ghl_opportunities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ghl_sync_status_updated BEFORE UPDATE ON public.ghl_sync_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ghl_dashboard_settings_updated BEFORE UPDATE ON public.ghl_dashboard_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ====== RLS ======
ALTER TABLE public.ghl_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_loss_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_sync_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_dashboard_settings ENABLE ROW LEVEL SECURITY;

-- Helper macro: members can view & manage; service role has full access
-- ghl_pipelines
CREATE POLICY "Members view ghl_pipelines" ON public.ghl_pipelines FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Service role full access ghl_pipelines" ON public.ghl_pipelines FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ghl_users
CREATE POLICY "Members view ghl_users" ON public.ghl_users FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Service role full access ghl_users" ON public.ghl_users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ghl_custom_fields
CREATE POLICY "Members view ghl_custom_fields" ON public.ghl_custom_fields FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Service role full access ghl_custom_fields" ON public.ghl_custom_fields FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ghl_loss_reasons
CREATE POLICY "Members view ghl_loss_reasons" ON public.ghl_loss_reasons FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Service role full access ghl_loss_reasons" ON public.ghl_loss_reasons FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ghl_opportunities
CREATE POLICY "Members view ghl_opportunities" ON public.ghl_opportunities FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Service role full access ghl_opportunities" ON public.ghl_opportunities FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ghl_sync_status
CREATE POLICY "Members view ghl_sync_status" ON public.ghl_sync_status FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Service role full access ghl_sync_status" ON public.ghl_sync_status FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ghl_dashboard_settings: members view; owners update; service role all
CREATE POLICY "Members view ghl_dashboard_settings" ON public.ghl_dashboard_settings FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members upsert ghl_dashboard_settings" ON public.ghl_dashboard_settings FOR INSERT WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members update ghl_dashboard_settings" ON public.ghl_dashboard_settings FOR UPDATE USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Service role full access ghl_dashboard_settings" ON public.ghl_dashboard_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
