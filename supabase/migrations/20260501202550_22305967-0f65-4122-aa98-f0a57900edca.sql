-- Restringe execução de funções internas apenas ao service_role e ao postgres.
-- Estas funções não devem ser chamáveis via PostgREST/clients públicos.

REVOKE EXECUTE ON FUNCTION public.trigger_ghl_sync_all() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- create_workspace é chamada via supabase.rpc() pelo frontend autenticado: mantém authenticated, revoga anon.
REVOKE EXECUTE ON FUNCTION public.create_workspace(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_workspace(text) TO authenticated;