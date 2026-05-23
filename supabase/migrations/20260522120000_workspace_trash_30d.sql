-- Lixeira de workspaces com expurgo automático em 30 dias.
-- "Excluir" no app passa a fazer soft delete (deleted_at = now()).
-- Um job diário do pg_cron apaga de vez o que estiver há +30 dias na lixeira,
-- disparando as FKs ON DELETE CASCADE já existentes (conversas, mensagens, etc.).

-- 1) coluna de soft delete
alter table public.workspaces
  add column if not exists deleted_at timestamptz;

-- 2) índice parcial: acelera a listagem da lixeira e o expurgo
create index if not exists idx_workspaces_deleted_at
  on public.workspaces (deleted_at)
  where deleted_at is not null;

-- 3) job diário (03:00 UTC) de expurgo definitivo
select cron.unschedule('purge-trashed-workspaces')
  where exists (select 1 from cron.job where jobname = 'purge-trashed-workspaces');

select cron.schedule(
  'purge-trashed-workspaces',
  '0 3 * * *',
  $purge$
    delete from public.workspaces
    where deleted_at is not null
      and deleted_at < now() - interval '30 days'
  $purge$
);
