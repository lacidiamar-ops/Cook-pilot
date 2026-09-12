begin;
create or replace function public.current_employee_id() returns uuid language sql stable security definer set search_path='' as $$select id from public.cph_employees where auth_uid=(select auth.uid()) and active order by created_at limit 1$$;
create or replace function public.current_employee_establishment_id() returns uuid language sql stable security definer set search_path='' as $$select establishment_id from public.cph_employees where auth_uid=(select auth.uid()) and active order by created_at limit 1$$;
create or replace function public.current_employee_role() returns text language sql stable security definer set search_path='' as $$select role from public.cph_employees where auth_uid=(select auth.uid()) and active order by created_at limit 1$$;
revoke select on public.cph_employees from anon,authenticated;
do $$declare cols text;begin
 select string_agg(quote_ident(column_name),',') into cols from information_schema.columns where table_schema='public' and table_name='cph_employees' and column_name not in ('pin_code','pin_hash');
 execute 'grant select ('||cols||') on public.cph_employees to authenticated';
end;$$;
commit;
