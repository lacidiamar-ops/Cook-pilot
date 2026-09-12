begin;
alter table public.cp_saas_launch_tokens drop constraint cp_saas_launch_tokens_app_check;
alter table public.cp_saas_launch_tokens add constraint cp_saas_launch_tokens_app_check check(app in ('center','safe','human'));
CREATE OR REPLACE FUNCTION public.cp_exchange_saas_launch_sso(p_token_hash text, p_app text)
 RETURNS TABLE(user_id uuid, email text, establishment_id uuid, display_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t public.cp_saas_launch_tokens%rowtype;
  a public.cp_saas_access%rowtype;
  acc public.cp_saas_accounts%rowtype;
begin
  if p_app not in ('center','safe','human') or coalesce(p_token_hash,'')='' then return; end if;

  select * into t
  from public.cp_saas_launch_tokens
  where token_hash=p_token_hash
  for update;

  if not found or t.app<>p_app or t.used_at is not null or t.expires_at<=now() then return; end if;

  select * into a
  from public.cp_saas_access a2
  where a2.user_id=t.user_id and a2.establishment_id=t.establishment_id and a2.is_active;

  if not found
     or (p_app='center' and not a.center_enabled)
     or (p_app='safe' and not a.safe_enabled)
     or (p_app='human' and not a.human_enabled) then return; end if;

  select * into acc
  from public.cp_saas_accounts a2
  where a2.user_id=t.user_id and a2.status='active';

  if not found then return; end if;

  update public.cp_saas_launch_tokens
  set used_at=now()
  where token_hash=p_token_hash;

  return query select acc.user_id,acc.email,t.establishment_id,acc.display_name;
end;
$function$;

revoke all on function public.cp_exchange_saas_launch_sso(text,text) from public,anon,authenticated;
grant execute on function public.cp_exchange_saas_launch_sso(text,text) to service_role;
commit;
