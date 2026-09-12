begin;
create table if not exists public.cp_app_catalog(id text primary key check(id in ('center','safe','human')),name text not null,logo_url text not null,install_url text not null);
alter table public.cp_app_catalog enable row level security;
revoke all on public.cp_app_catalog from anon,authenticated;
grant select on public.cp_app_catalog to authenticated;
grant all on public.cp_app_catalog to service_role;
drop policy if exists cp_app_catalog_read on public.cp_app_catalog;
create policy cp_app_catalog_read on public.cp_app_catalog for select to authenticated using(true);
insert into public.cp_app_catalog(id,name,logo_url,install_url) values
('center','Cook Pilot Center','https://cook-pilot-gestion.vercel.app/logo-center.jpg','https://cook-pilot-gestion.vercel.app/'),
('safe','Cook Pilot Safe','https://cook-pilot-haccp.vercel.app/logo-safe.jpg','https://cook-pilot-haccp.vercel.app/'),
('human','Cook Pilot Human','https://cook-pilot-human.vercel.app/logo-human.jpg','https://cook-pilot-human.vercel.app/saas.html')
on conflict(id) do update set name=excluded.name,logo_url=excluded.logo_url,install_url=excluded.install_url;
commit;
