-- Cook Pilot SaaS delivery. Service-only onboarding and atomic module selection.
begin;
create table if not exists public.cp_client_invitations (
 establishment_id uuid primary key references public.cpg_establishments(id) on delete cascade,
 email text not null unique, display_name text not null, enabled boolean not null default true,
 user_id uuid references auth.users(id), last_requested_at timestamptz,
 delivery_status text not null default 'pending', created_at timestamptz not null default now()
);
alter table public.cp_client_invitations enable row level security;
revoke all on public.cp_client_invitations from anon,authenticated;
grant all on public.cp_client_invitations to service_role;
create or replace function public.cp_set_client_modules(p_establishment_id uuid,p_center boolean,p_safe boolean,p_human boolean)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if current_user not in ('postgres','service_role') then raise exception 'service_role_required'; end if;
 if p_center is null or p_safe is null or p_human is null or not (p_center or p_safe or p_human) then raise exception 'select_at_least_one_module'; end if;
 update public.cpg_establishments set gestion_enabled=p_center,haccp_enabled=p_safe,human_enabled=p_human,updated_at=now() where id=p_establishment_id;
 if not found then raise exception 'establishment_not_found'; end if;
 update public.cp_saas_access set center_enabled=p_center,safe_enabled=p_safe,human_enabled=p_human,updated_at=now() where establishment_id=p_establishment_id;
 update public.cook_pilot_company_onboarding set modules=jsonb_build_object('center',p_center,'safe',p_safe,'human',p_human),updated_at=now() where establishment_id=p_establishment_id;
end; $$;
revoke all on function public.cp_set_client_modules(uuid,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.cp_set_client_modules(uuid,boolean,boolean,boolean) to service_role;
CREATE OR REPLACE FUNCTION public.cp_bind_client_owner(p_user_id uuid, p_email text, p_display_name text, p_establishment_id uuid, p_safe_pin text, p_human_pin text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_first text;v_last text;v_safe uuid;v_human uuid;
begin
  if p_safe_pin !~ '^[0-9]{4}$' or p_human_pin !~ '^[0-9]{4}$' then raise exception 'PIN format invalid'; end if;
  if not exists(select 1 from cpg_establishments where id=p_establishment_id) then raise exception 'Unknown establishment'; end if;
  if current_user not in ('postgres','service_role') then raise exception 'service_role_required'; end if;
  select id into v_safe from haccp_employees where establishment_id=p_establishment_id and (auth_uid=p_user_id or (auth_uid is null and full_name=p_display_name)) order by (auth_uid=p_user_id) desc nulls last,created_at limit 1;
  v_safe:=coalesce(v_safe,gen_random_uuid());
  select id into v_human from cph_employees where establishment_id=p_establishment_id and (auth_uid=p_user_id or (auth_uid is null and full_name=p_display_name)) order by (auth_uid=p_user_id) desc nulls last,created_at limit 1;
  v_human:=coalesce(v_human,gen_random_uuid());
  v_first:=split_part(trim(p_display_name),' ',1);v_last:=nullif(trim(substring(trim(p_display_name) from length(v_first)+1)),'');
  insert into cp_saas_accounts(user_id,email,display_name,account_type,status,must_change_password) values(p_user_id,lower(p_email),p_display_name,'owner','active',true) on conflict(user_id) do update set email=excluded.email,display_name=excluded.display_name,status='active',updated_at=now();
  insert into cp_saas_access(user_id,establishment_id,role,center_enabled,safe_enabled,human_enabled,is_active) values(p_user_id,p_establishment_id,'owner',true,true,true,true) on conflict(user_id,establishment_id) do update set role='owner',center_enabled=true,safe_enabled=true,human_enabled=true,is_active=true,updated_at=now();
  insert into cp_saas_pins(user_id,establishment_id,app,pin_hash,must_change) values(p_user_id,p_establishment_id,'safe',crypt(p_safe_pin,gen_salt('bf')),true),(p_user_id,p_establishment_id,'human',crypt(p_human_pin,gen_salt('bf')),true) on conflict(user_id,establishment_id,app) do update set pin_hash=excluded.pin_hash,must_change=true,failed_attempts=0,locked_until=null,updated_at=now();
  insert into center_profiles(id,first_name,last_name,is_platform_admin) values(p_user_id,v_first,v_last,false) on conflict(id) do update set first_name=excluded.first_name,last_name=excluded.last_name,updated_at=now();
  insert into center_establishments(id,name,currency,timezone,is_active) select id,name,'EUR','Europe/Paris',true from cpg_establishments where id=p_establishment_id on conflict(id) do nothing;
  insert into center_memberships(user_id,establishment_id,role,is_active) values(p_user_id,p_establishment_id,'owner',true) on conflict(user_id,establishment_id) do update set role='owner',is_active=true,updated_at=now();
  insert into cpg_user_roles(user_id,establishment_id,role) values(p_user_id,p_establishment_id,'owner') on conflict(user_id,establishment_id) do update set role='owner';
  insert into haccp_employees(id,full_name,prenom,nom,initials,color,poste,role,pin_code,active,establishment_id,auth_uid) values(v_safe,p_display_name,v_first,v_last,upper(left(v_first,1)||left(coalesce(v_last,''),1)),'#0F766E','Gérant','manager',null,true,p_establishment_id,p_user_id) on conflict(id) do update set full_name=excluded.full_name,prenom=excluded.prenom,nom=excluded.nom,poste='Gérant',role='manager',active=true,establishment_id=p_establishment_id,auth_uid=p_user_id,updated_at=now();
  insert into employee_profiles(employee_id,full_name,role,is_manager,is_active) values(v_safe::text,p_display_name,'manager',true,true) on conflict(employee_id) do update set full_name=excluded.full_name,role='manager',is_manager=true,is_active=true,updated_at=now();
  insert into employee_pins(employee_id,pin_hash,must_change_pin,reset_count,updated_at,updated_by) values(v_safe::text,encode(digest(v_safe::text||':'||p_safe_pin,'sha256'),'hex'),true,0,now(),'saas-bootstrap') on conflict(employee_id) do update set pin_hash=excluded.pin_hash,must_change_pin=true,updated_at=now(),updated_by='saas-bootstrap';
  insert into cph_employees(id,full_name,pin_code,role,active,job_title,contract_type,weekly_hours,hourly_rate,initials,color,establishment_id,auth_uid) values(v_human,p_display_name,'SAAS_SSO','manager',true,'Gérant','DIRIGEANT',0,0,upper(left(v_first,1)||left(coalesce(v_last,''),1)),'#6F2D68',p_establishment_id,p_user_id) on conflict(id) do update set full_name=excluded.full_name,role='manager',active=true,job_title='Gérant',establishment_id=p_establishment_id,auth_uid=p_user_id,updated_at=now();
  update cp_saas_access a set center_enabled=e.gestion_enabled,safe_enabled=e.haccp_enabled,human_enabled=e.human_enabled from cpg_establishments e where a.establishment_id=e.id and a.user_id=p_user_id and e.id=p_establishment_id;
  update cook_pilot_company_onboarding set status='activated',activation_status='active',activated_at=coalesce(activated_at,now()),updated_at=now() where establishment_id=p_establishment_id;
  perform cp_seed_default_task_templates(p_establishment_id);
  perform cp_generate_daily_tasks(p_establishment_id,(now() at time zone 'Europe/Paris')::date);
end;
$function$;

revoke all on function public.cp_bind_client_owner(uuid,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.cp_bind_client_owner(uuid,text,text,uuid,text,text) to service_role;

-- Existing customer: authorize only the already identified establishment and responsible person.
insert into public.cp_client_invitations(establishment_id,email,display_name)
select e.id,lower(e.email),h.full_name from public.cpg_establishments e
join public.haccp_employees h on h.establishment_id=e.id
where lower(e.email)='lecabanoncampus@gmail.com' and e.name='LE CABANON' and h.full_name='Yann Barberis' and h.active
on conflict(establishment_id) do nothing;
create or replace function public.cp_prepare_client(p_id uuid,p_name text,p_legal text,p_email text,p_owner text,p_center boolean,p_safe boolean,p_human boolean,p_address text,p_city text,p_postal text,p_phone text,p_siret text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if current_user not in ('postgres','service_role') then raise exception 'service_role_required'; end if;
 if not (p_center or p_safe or p_human) then raise exception 'select_at_least_one_module'; end if;
 insert into public.cpg_establishments(id,name,siret,address,city,postal_code,phone,email,gestion_enabled,haccp_enabled,human_enabled)
 values(p_id,p_name,p_siret,p_address,p_city,p_postal,p_phone,lower(p_email),p_center,p_safe,p_human);
 insert into public.center_establishments(id,name,legal_name,siret,address,currency,timezone,is_active)
 values(p_id,p_name,p_legal,p_siret,jsonb_build_object('line1',p_address,'city',p_city,'postal_code',p_postal),'EUR','Europe/Paris',true);
 insert into public.cpg_settings(establishment_id) values(p_id);
 insert into public.cook_pilot_company_onboarding(establishment_id,legal_name,trade_name,contact_name,contact_role,contact_email,modules)
 values(p_id,p_legal,p_name,p_owner,'Gérant',lower(p_email),jsonb_build_object('center',p_center,'safe',p_safe,'human',p_human));
 insert into public.cp_client_invitations(establishment_id,email,display_name) values(p_id,lower(p_email),p_owner);
end; $$;
revoke all on function public.cp_prepare_client(uuid,text,text,text,text,boolean,boolean,boolean,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.cp_prepare_client(uuid,text,text,text,text,boolean,boolean,boolean,text,text,text,text,text) to service_role;
commit;
