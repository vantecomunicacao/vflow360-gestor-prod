-- Conversas 2.0 — auto-execução de sugestões auto-aprovadas (auto_approve).
--
-- Contexto: a v2 marca sugestões com auto_approve como status='approved' mas NÃO
-- as executa (execução edge->edge é proibida nesse Supabase — "falha silencioso").
-- Resultado: "aprovada" que nunca ia pro CRM. Este cron fecha esse buraco no
-- padrão sancionado postgres->edge: drena as aprovadas pendentes e chama
-- ghl-manage/execute_suggestion.
--
-- Segurança: execute_suggestion exige service-role para auto-exec. A chave NÃO
-- fica no repo — é lida do Vault (secret 'service_role_key', populado fora do
-- versionamento). Retry é limitado a 3 tentativas por sugestão (auto_exec_tries)
-- para nunca entrar em loop infinito numa que falhe sempre.

create or replace function public.trigger_ghl_v2_auto_execute()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  s record;
  skey text;
begin
  select decrypted_secret into skey
    from vault.decrypted_secrets
   where name = 'service_role_key'
   limit 1;
  if skey is null then
    raise notice 'service_role_key ausente no vault; auto-exec abortado';
    return;
  end if;

  for s in
    select id, user_id, workspace_id
      from public.suggestions
     where status = 'approved'
       and coalesce((action_data->>'executed')::boolean, false) = false
       and coalesce(action_data->>'auto_execute_pending', 'false') = 'true'
       and coalesce((action_data->>'auto_exec_tries')::int, 0) < 3
     order by created_at asc
     limit 20
  loop
    -- Incrementa as tentativas ANTES de chamar (bound de 3). Em sucesso, o
    -- execute_suggestion grava executed=true e a sugestão sai do filtro.
    update public.suggestions
       set action_data = jsonb_set(
             action_data,
             '{auto_exec_tries}',
             to_jsonb(coalesce((action_data->>'auto_exec_tries')::int, 0) + 1)
           )
     where id = s.id;

    perform net.http_post(
      url := 'https://xcrfbpyhyznyufijrdry.supabase.co/functions/v1/ghl-manage',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || skey
      ),
      body := jsonb_build_object(
        'action', 'execute_suggestion',
        'suggestionId', s.id,
        'userId', s.user_id,
        'workspace_id', s.workspace_id
      ),
      timeout_milliseconds := 60000
    );
  end loop;
end;
$function$;

-- Agenda a cada 3 min (defasado dos ticks de sync/analyze).
select cron.unschedule('ghl-v2-auto-execute-tick')
  where exists (select 1 from cron.job where jobname = 'ghl-v2-auto-execute-tick');
select cron.schedule(
  'ghl-v2-auto-execute-tick',
  '*/3 * * * *',
  $tick$ select public.trigger_ghl_v2_auto_execute(); $tick$
);
