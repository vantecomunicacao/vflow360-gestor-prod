-- Per-workspace toggle to enable/disable the AI co-pilot suggestions.
-- Default false: existing and new workspaces start disabled; admin must opt-in.
alter table public.workspaces
  add column if not exists ai_analysis_enabled boolean not null default false;

comment on column public.workspaces.ai_analysis_enabled is
  'When false, the AI co-pilot (ai-analyze) will not generate suggestions for this workspace. Admin-controlled.';

-- Admins can update any workspace (needed to flip the toggle on workspaces they do not own).
drop policy if exists "Admins can update all workspaces" on public.workspaces;
create policy "Admins can update all workspaces"
on public.workspaces
for update
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));
