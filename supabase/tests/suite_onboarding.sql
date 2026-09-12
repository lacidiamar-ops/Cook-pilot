begin;
do $test$
declare tenant uuid:=gen_random_uuid(); usr uuid:=gen_random_uuid(); flags integer;
begin
 insert into auth.users(id,email,aud,role) values(usr,usr::text||'@example.invalid','authenticated','authenticated');
 perform public.cp_prepare_client(tenant,'Cook Pilot automated test','Cook Pilot automated test',usr::text||'@example.invalid','Test Manager',false,true,false,null,null,null,null,null);
 perform public.cp_bind_client_owner(usr,usr::text||'@example.invalid','Test Manager',tenant,'7349','8327');
 if not exists(select 1 from cp_saas_access where user_id=usr and not center_enabled and safe_enabled and not human_enabled) then raise exception 'Initial modules mismatch'; end if;
 for flags in 1..7 loop
  perform public.cp_set_client_modules(tenant,(flags&1)>0,(flags&2)>0,(flags&4)>0);
  if not exists(select 1 from cp_saas_access where user_id=usr and center_enabled=((flags&1)>0) and safe_enabled=((flags&2)>0) and human_enabled=((flags&4)>0)) then raise exception 'Modules mismatch %',flags; end if;
 end loop;
 begin
  perform public.cp_set_client_modules(tenant,false,false,false);
  raise exception 'Empty selection accepted';
 exception when others then if SQLERRM <> 'select_at_least_one_module' then raise; end if; end;
 if has_function_privilege('authenticated','public.cp_set_client_modules(uuid,boolean,boolean,boolean)','EXECUTE') or has_function_privilege('anon','public.cp_bind_client_owner(uuid,text,text,uuid,text,text)','EXECUTE') then raise exception 'Public onboarding privilege'; end if;
end;$test$;
rollback;
select 'PASS: provisioning, 7 module combinations, empty rejection, RPC privileges; all synthetic data rolled back' result;
