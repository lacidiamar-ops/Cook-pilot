begin;
create or replace function public.cp_change_my_saas_pin(p_establishment_id uuid,p_app text,p_current_pin text,p_new_pin text)
returns boolean language plpgsql security definer set search_path='public','extensions' as $$
declare r public.cp_saas_pins%rowtype;
begin
 if auth.uid() is null or p_app not in ('safe','human') or p_new_pin is null or p_new_pin !~ '^[0-9]{4}$' then return false; end if;
 if not exists(select 1 from public.cp_saas_access a join public.cp_saas_accounts u on u.user_id=a.user_id where a.user_id=auth.uid() and a.establishment_id=p_establishment_id and a.is_active and u.status='active') then return false; end if;
 select * into r from public.cp_saas_pins where user_id=auth.uid() and establishment_id=p_establishment_id and app=p_app for update;
 if not found or r.locked_until>now() then return false; end if;
 -- A newly invited user chooses their first PIN after proving ownership of their email account.
 if not r.must_change and (p_current_pin is null or p_current_pin !~ '^[0-9]{4}$' or crypt(p_current_pin,r.pin_hash) is distinct from r.pin_hash) then
  update public.cp_saas_pins set failed_attempts=failed_attempts+1,locked_until=case when failed_attempts+1>=5 then now()+interval '15 minutes' else locked_until end,updated_at=now() where id=r.id;
  return false;
 end if;
 update public.cp_saas_pins set pin_hash=crypt(p_new_pin,gen_salt('bf')),must_change=false,failed_attempts=0,locked_until=null,updated_at=now() where id=r.id;
 return true;
end; $$;
revoke all on function public.cp_change_my_saas_pin(uuid,text,text,text) from public,anon;
grant execute on function public.cp_change_my_saas_pin(uuid,text,text,text) to authenticated;
commit;
