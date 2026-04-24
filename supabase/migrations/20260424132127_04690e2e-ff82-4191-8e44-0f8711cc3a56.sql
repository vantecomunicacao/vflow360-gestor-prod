
-- Split existing ganho_perdido ai_config into marcar_ganho + marcar_perdido,
-- preserving each user's enabled / auto_approve choices.
INSERT INTO public.ai_config (user_id, workspace_id, action_type, enabled, auto_approve)
SELECT user_id, workspace_id, 'marcar_ganho', enabled, auto_approve
FROM public.ai_config
WHERE action_type = 'ganho_perdido'
ON CONFLICT DO NOTHING;

INSERT INTO public.ai_config (user_id, workspace_id, action_type, enabled, auto_approve)
SELECT user_id, workspace_id, 'marcar_perdido', enabled, auto_approve
FROM public.ai_config
WHERE action_type = 'ganho_perdido'
ON CONFLICT DO NOTHING;

DELETE FROM public.ai_config WHERE action_type = 'ganho_perdido';
