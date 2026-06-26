-- Cook Pilot Command — durcissement des rôles.
-- Seul le propriétaire du workspace peut ajouter, modifier ou retirer des membres.

create or replace function public.command_is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.command_workspaces workspace
    where workspace.id = target_workspace_id
      and workspace.owner_user_id = auth.uid()
  );
$$;

revoke all on function public.command_is_workspace_owner(uuid) from public;
grant execute on function public.command_is_workspace_owner(uuid) to authenticated;

drop policy if exists command_member_manage on public.command_workspace_members;
create policy command_member_manage on public.command_workspace_members
for all to authenticated
using (public.command_is_workspace_owner(workspace_id))
with check (public.command_is_workspace_owner(workspace_id));
