CREATE INDEX IF NOT EXISTS idx_ghl_opps_ws_created ON public.ghl_opportunities(workspace_id, ghl_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ghl_opps_ws_stage ON public.ghl_opportunities(workspace_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_ghl_opps_ws_status ON public.ghl_opportunities(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_ghl_opps_ws_lastchange ON public.ghl_opportunities(workspace_id, last_status_change_at DESC);
CREATE INDEX IF NOT EXISTS idx_ghl_opps_ws_pipeline ON public.ghl_opportunities(workspace_id, pipeline_id);