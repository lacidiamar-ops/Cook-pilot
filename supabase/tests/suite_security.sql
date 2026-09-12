begin;
do $test$
declare tenant uuid:=gen_random_uuid(); usr uuid:=gen_random_uuid(); token text:=encode(extensions.gen_random_bytes(32),'hex'); count_matches int;
begin
 insert into auth.users(id,email,aud,role) values(usr,usr::text||'@example.invalid','authenticated','authenticated');
 perform cp_prepare_client(tenant,'SaaS regression','SaaS regression',usr::text||'@example.invalid','SaaS Manager',true,true,true,null,null,null,null,null);
 perform cp_bind_client_owner(usr,usr::text||'@example.invalid','SaaS Manager',tenant,'7391','5824');
 perform set_config('request.jwt.claim.sub',usr::text,true);
 if not cook_pilot_private.module_enabled(tenant,'safe') then raise exception 'Safe entitlement refused'; end if;
 perform cp_set_client_modules(tenant,false,true,false);
 if cook_pilot_private.module_enabled(tenant,'center') or cook_pilot_private.module_enabled(tenant,'human') then raise exception 'Disabled module accepted'; end if;
 if not cp_change_my_saas_pin(tenant,'safe',null,'2917') then raise exception 'First PIN failed'; end if;
 if cp_change_my_saas_pin(tenant,'safe',null,'1732') then raise exception 'NULL PIN bypass'; end if;
 if not cp_change_my_saas_pin(tenant,'safe','2917','7391') then raise exception 'PIN change failed'; end if;
 insert into cp_saas_launch_tokens(token_hash,user_id,establishment_id,app,expires_at) values(token,usr,tenant,'safe',now()+interval '5 minutes');
 select count(*) into count_matches from cp_exchange_saas_launch_sso(token,'safe');
 if count_matches<>1 then raise exception 'SSO exchange failed'; end if;
 select count(*) into count_matches from cp_exchange_saas_launch_sso(token,'safe');
 if count_matches<>0 then raise exception 'SSO replay accepted'; end if;
 update cp_saas_accounts set status='suspended' where user_id=usr;
 if cook_pilot_private.module_enabled(tenant,'safe') then raise exception 'Suspended account accepted'; end if;
end;$test$;
rollback;
select 'PASS: module entitlements, suspension, initial PIN, NULL rejection, PIN change, SSO and replay denial; rolled back' result;
