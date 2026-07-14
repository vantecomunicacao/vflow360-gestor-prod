-- Auto-execucao passa a respeitar ai_config.enabled.
--
-- Bug: sugestoes de um tipo DESLIGADO em ai_config eram criadas mesmo assim
-- (o ai-analyze-v2 lia `enabled` e ignorava, exceto para ganho_perdido) e, se o
-- tipo tinha auto_approve=true herdado de quando estava ligado, nasciam como
-- 'approved' + auto_execute_pending e este cron as executava no CRM. Sintoma:
-- lead movido de etapa com "Mover funil" desligado na UI.
--
-- O fix na origem esta no ai-analyze-v2 (gate no insert). Esta migration fecha a
-- porta para o BACKLOG ja enfileirado (aprovadas antes do fix) e para qualquer
-- sugestao que fique pendente quando o usuario desliga um tipo depois de ela ser
-- criada. Sugestoes puladas apenas deixam de ser elegiveis (nao consomem retry,
-- nao viram erro) e voltam a ser elegiveis se o tipo for religado.
--
-- Chaveamento: suggestions.user_id = owner do workspace, que e a MESMA chave que o
-- ai-analyze-v2 usa para ler ai_config (owner_id). Consistente com a UI, cujo RLS
-- (auth.uid() = user_id) so permite ao owner gravar a config do proprio workspace.
--
-- Unica mudanca vs. 20260607130000: a clausula NOT EXISTS no SELECT do loop.

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
      from public.suggestions sg
     where status = 'approved'
       and coalesce((action_data->>'executed')::boolean, false) = false
       and coalesce(action_data->>'auto_execute_pending', 'false') = 'true'
       and coalesce((action_data->>'auto_exec_tries')::int, 0) < 3
       -- Nunca auto-executa um tipo desabilitado em ai_config. ganho_perdido e
       -- armazenado como um tipo so, mas configurado em duas chaves distintas
       -- (marcar_ganho / marcar_perdido) — resolvidas pelo valor da sugestao.
       and not exists (
         select 1
           from public.ai_config c
          where c.workspace_id = sg.workspace_id
            and c.user_id = sg.user_id
            and c.enabled = false
            and c.action_type = case
                  when sg.type = 'ganho_perdido' then
                    case
                      when lower(coalesce(sg.action_data->>'value', '')) like '%ganh%'
                        then 'marcar_ganho'
                      else 'marcar_perdido'
                    end
                  else sg.type
                end
       )
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
