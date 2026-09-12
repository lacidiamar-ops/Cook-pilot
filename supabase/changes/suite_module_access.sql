begin;
create schema if not exists cook_pilot_private;
revoke all on schema cook_pilot_private from public;
grant usage on schema cook_pilot_private to authenticated;
-- Internal entitlement lookup only. Existing tenant policies remain mandatory.
create or replace function cook_pilot_private.module_enabled(target uuid,module text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); enabled boolean; account_status text; access_enabled boolean;
begin
 if uid is null or module not in ('center','safe','human') then return false; end if;
 select case module when 'center' then gestion_enabled when 'safe' then haccp_enabled else human_enabled end into enabled from public.cpg_establishments where id=target;
 if enabled is distinct from true then return false; end if;
 select status into account_status from public.cp_saas_accounts where user_id=uid;
 if not found then return true; end if; -- Legacy accounts still require the original tenant policy.
 if account_status<>'active' then return false; end if;
 select is_active and case module when 'center' then center_enabled when 'safe' then safe_enabled else human_enabled end into access_enabled from public.cp_saas_access where user_id=uid and establishment_id=target;
 return coalesce(access_enabled,false);
end; $$;
revoke all on function cook_pilot_private.module_enabled(uuid,text) from public,anon;
grant execute on function cook_pilot_private.module_enabled(uuid,text) to authenticated;
do $$
declare r record; app text;
begin
 for r in select t.tablename from pg_tables t join information_schema.columns c on c.table_schema=t.schemaname and c.table_name=t.tablename and c.column_name='establishment_id'
 where t.schemaname='public' and (t.tablename like 'cph_%' or t.tablename like 'haccp_%' or t.tablename like 'cpg_%' or t.tablename in ('center_action_jobs','center_command_runs','center_document_extractions','temperatures','receptions','tracabilite','anomalies','distribution','cuisson_refroidissement','decongélation','huiles_friture','pms_nettoyage','pms_validations','echantillons'))
 and t.tablename not in ('cpg_user_roles','cpg_device_accounts','cpg_encryption_keys','cpg_ia_rate_limits','cph_employee_sessions')
 loop
 app:=case when r.tablename like 'cph_%' then 'human' when r.tablename like 'cpg_%' or r.tablename like 'center_%' then 'center' else 'safe' end;
 execute format('drop policy if exists cook_pilot_subscription on public.%I',r.tablename);
 execute format('create policy cook_pilot_subscription on public.%I as restrictive for all to authenticated using (cook_pilot_private.module_enabled(establishment_id,%L)) with check (cook_pilot_private.module_enabled(establishment_id,%L))',r.tablename,app,app);
 end loop;
end; $$;
create or replace function public.cp_protect_human_identity() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user in ('anon','authenticated') then
  if new.id is distinct from old.id or new.auth_uid is distinct from old.auth_uid or new.establishment_id is distinct from old.establishment_id or new.pin_code is distinct from old.pin_code or new.pin_hash is distinct from old.pin_hash then raise exception 'identity_fields_server_only'; end if;
  if (new.role is distinct from old.role or new.active is distinct from old.active) and public.current_employee_role() is distinct from 'manager' then raise exception 'manager_required'; end if;
 end if;
 return new;
end; $$;
revoke all on function public.cp_protect_human_identity() from public,anon,authenticated;
drop trigger if exists cp_protect_human_identity on public.cph_employees;
create trigger cp_protect_human_identity before update on public.cph_employees for each row execute function public.cp_protect_human_identity();
commit;
