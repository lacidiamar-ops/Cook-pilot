begin;
do $test$
declare tenant uuid:=gen_random_uuid(); usr uuid:=gen_random_uuid(); seen integer;
begin
 insert into auth.users(id,email,aud,role) values(usr,usr::text||'@example.invalid','authenticated','authenticated');
 perform cp_prepare_client(tenant,'RLS test','RLS test',usr::text||'@example.invalid','RLS Manager',true,true,true,null,null,null,null,null);
 perform cp_bind_client_owner(usr,usr::text||'@example.invalid','RLS Manager',tenant,'8392','6173');
 perform set_config('request.jwt.claim.sub',usr::text,true);
 execute 'set local role authenticated';
 select count(*) into seen from cph_employees where establishment_id=tenant;
 if seen<>1 then raise exception 'Human manager cannot see own employee'; end if;
 if exists(select 1 from cph_employees where establishment_id<>tenant) then raise exception 'Human foreign tenant visible'; end if;
 begin
 perform pin_code from cph_employees;
 raise exception 'PIN exposed';
 exception when insufficient_privilege then null;end;
 if exists(select 1 from cpg_invoices where establishment_id<>tenant) then raise exception 'Center foreign tenant visible'; end if;
 execute 'reset role';
 update cph_employees set active=false where auth_uid=usr;
 execute 'set local role authenticated';
 if public.current_employee_id() is not null then raise exception 'Inactive Human employee accepted'; end if;
 execute 'reset role';
end;$test$;
rollback;select 'PASS: real authenticated RLS, own Human profile, cross-tenant isolation, PIN column denied, inactive user denied' result;
