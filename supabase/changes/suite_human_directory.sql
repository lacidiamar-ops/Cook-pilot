-- Employee lists before PIN entry are served by device-bootstrap with a pairing token.
-- This legacy RPC must never expose a default restaurant to anonymous visitors.
create or replace function public.cph_pick_employees(p_est uuid default null)
returns table(id uuid,full_name text,role text,active boolean,job_title text,color text,initials text)
language plpgsql stable security definer set search_path='' as $fn$
declare
 v_uid uuid:=auth.uid();
 v_est uuid:=coalesce(p_est,public.current_employee_establishment_id());
begin
 if v_uid is null or v_est is null then return; end if;
 if not cook_pilot_private.module_enabled(v_est,'human') then return; end if;
 if not (exists(select 1 from public.cph_employees e where e.auth_uid=v_uid and e.establishment_id=v_est and e.active)
   or exists(select 1 from public.cp_saas_access a where a.user_id=v_uid and a.establishment_id=v_est and a.is_active and a.human_enabled)) then return; end if;
 return query select e.id,e.full_name,e.role,e.active,e.job_title,e.color,e.initials
 from public.cph_employees e where e.active and e.establishment_id=v_est
 order by case when e.role='manager' then 0 else 1 end,e.full_name;
end;$fn$;
revoke execute on function public.cph_pick_employees(uuid) from public,anon;
grant execute on function public.cph_pick_employees(uuid) to authenticated,service_role;
