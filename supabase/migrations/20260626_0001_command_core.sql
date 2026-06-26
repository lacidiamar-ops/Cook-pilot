-- Cook Pilot Command
-- Base isolée : commandes vocales, agents, support, validations et audit.
-- Cette migration est prévue pour un projet Supabase dédié à Command.

create extension if not exists pgcrypto;

create table if not exists public.command_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.command_workspace_members (
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'operator' check (role in ('founder','admin','operator','support','finance','commercial','viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.command_clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  legal_name text not null,
  status text not null default 'lead' check (status in ('lead','prospect','client','suspended','archived')),
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.command_restaurants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  client_id uuid references public.command_clients(id) on delete set null,
  name text not null,
  site_code text,
  manager_name text,
  manager_email text,
  manager_phone text,
  status text not null default 'active' check (status in ('onboarding','active','paused','suspended','archived')),
  remote_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, site_code)
);

create table if not exists public.command_app_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  restaurant_id uuid not null references public.command_restaurants(id) on delete cascade,
  product_code text not null check (product_code in ('gestion','human','haccp','scan')),
  environment text not null default 'production' check (environment in ('production','staging','development')),
  status text not null default 'setup' check (status in ('setup','online','degraded','offline','maintenance','disabled')),
  remote_workspace_reference text,
  app_version text,
  last_seen_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, product_code, environment)
);

create table if not exists public.command_voice_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  restaurant_id uuid references public.command_restaurants(id) on delete set null,
  requested_by_user_id uuid references auth.users(id) on delete set null,
  source text not null default 'voice' check (source in ('voice','text','system')),
  transcript text not null check (char_length(trim(transcript)) between 1 and 12000),
  normalized_intent jsonb not null default '{}'::jsonb,
  assigned_agent_key text,
  risk_level text not null default 'low' check (risk_level in ('low','medium','high','critical')),
  status text not null default 'received' check (status in ('received','processing','awaiting_approval','approved','rejected','completed','failed','cancelled')),
  result_summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.command_agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  voice_request_id uuid references public.command_voice_requests(id) on delete set null,
  agent_key text not null check (agent_key in ('technical','finance','commercial','customer_success','journal','marketing','orchestrator')),
  run_status text not null default 'queued' check (run_status in ('queued','running','awaiting_approval','completed','failed','cancelled')),
  risk_level text not null default 'low' check (risk_level in ('low','medium','high','critical')),
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.command_support_tickets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  restaurant_id uuid references public.command_restaurants(id) on delete set null,
  app_connection_id uuid references public.command_app_connections(id) on delete set null,
  created_from_voice_request_id uuid references public.command_voice_requests(id) on delete set null,
  ticket_number bigint generated always as identity unique,
  source text not null default 'chat' check (source in ('chat','voice','email','monitoring','system')),
  status text not null default 'open' check (status in ('open','in_progress','waiting_client','waiting_approval','resolved','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  reporter_name text,
  reporter_email text,
  reporter_user_reference text,
  subject text not null,
  description text not null,
  assigned_agent_key text not null default 'technical' check (assigned_agent_key in ('technical','finance','commercial','customer_success','journal','marketing')),
  diagnostic jsonb not null default '{}'::jsonb,
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.command_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  ticket_id uuid not null references public.command_support_tickets(id) on delete cascade,
  author_type text not null check (author_type in ('restaurant_user','agent','founder','system')),
  author_user_id uuid references auth.users(id) on delete set null,
  agent_key text,
  channel text not null check (channel in ('chat','email','voice','system')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.command_approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  voice_request_id uuid references public.command_voice_requests(id) on delete set null,
  agent_run_id uuid references public.command_agent_runs(id) on delete set null,
  ticket_id uuid references public.command_support_tickets(id) on delete set null,
  action_type text not null,
  title text not null,
  description text not null,
  action_payload jsonb not null default '{}'::jsonb,
  risk_level text not null default 'medium' check (risk_level in ('low','medium','high','critical')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','expired')),
  requested_by_agent_key text,
  decided_by_user_id uuid references auth.users(id) on delete set null,
  decision_mode text check (decision_mode in ('voice','button','system')),
  decision_note text,
  decided_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.command_outbound_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  restaurant_id uuid references public.command_restaurants(id) on delete set null,
  ticket_id uuid references public.command_support_tickets(id) on delete set null,
  approval_id uuid references public.command_approvals(id) on delete set null,
  channel text not null check (channel in ('email','in_app','chat')),
  status text not null default 'draft' check (status in ('draft','awaiting_approval','approved','queued','sent','failed','cancelled')),
  recipient_name text,
  recipient_email text,
  subject text,
  body text not null,
  template_key text,
  prepared_by_agent_key text,
  provider_message_reference text,
  sent_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.command_audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  actor_type text not null check (actor_type in ('founder','agent','restaurant_user','system')),
  actor_user_id uuid references auth.users(id) on delete set null,
  agent_key text,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists command_clients_workspace_idx on public.command_clients(workspace_id, status);
create index if not exists command_restaurants_workspace_idx on public.command_restaurants(workspace_id, status);
create index if not exists command_connections_workspace_idx on public.command_app_connections(workspace_id, status, last_seen_at desc);
create index if not exists command_voice_workspace_idx on public.command_voice_requests(workspace_id, status, created_at desc);
create index if not exists command_agent_runs_workspace_idx on public.command_agent_runs(workspace_id, run_status, created_at desc);
create index if not exists command_tickets_workspace_idx on public.command_support_tickets(workspace_id, status, priority, created_at desc);
create index if not exists command_ticket_messages_ticket_idx on public.command_ticket_messages(ticket_id, created_at asc);
create index if not exists command_approvals_workspace_idx on public.command_approvals(workspace_id, status, created_at desc);
create index if not exists command_outbound_workspace_idx on public.command_outbound_messages(workspace_id, status, created_at desc);
create index if not exists command_audit_workspace_idx on public.command_audit_log(workspace_id, created_at desc);

create or replace function public.command_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.command_seed_workspace_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.command_workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_user_id, 'founder')
  on conflict (workspace_id, user_id) do nothing;
  return new;
end;
$$;

create or replace function public.command_is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.command_workspaces workspace
    where workspace.id = target_workspace_id
      and (
        workspace.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.command_workspace_members member
          where member.workspace_id = target_workspace_id
            and member.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.command_can_manage_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.command_workspaces workspace
    where workspace.id = target_workspace_id
      and (
        workspace.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.command_workspace_members member
          where member.workspace_id = target_workspace_id
            and member.user_id = auth.uid()
            and member.role in ('founder', 'admin')
        )
      )
  );
$$;

revoke all on function public.command_is_workspace_member(uuid) from public;
revoke all on function public.command_can_manage_workspace(uuid) from public;
grant execute on function public.command_is_workspace_member(uuid) to authenticated;
grant execute on function public.command_can_manage_workspace(uuid) to authenticated;

drop trigger if exists command_workspace_owner_member on public.command_workspaces;
create trigger command_workspace_owner_member
after insert on public.command_workspaces
for each row execute function public.command_seed_workspace_owner_member();

drop trigger if exists command_workspaces_updated_at on public.command_workspaces;
create trigger command_workspaces_updated_at before update on public.command_workspaces
for each row execute function public.command_set_updated_at();

drop trigger if exists command_clients_updated_at on public.command_clients;
create trigger command_clients_updated_at before update on public.command_clients
for each row execute function public.command_set_updated_at();

drop trigger if exists command_restaurants_updated_at on public.command_restaurants;
create trigger command_restaurants_updated_at before update on public.command_restaurants
for each row execute function public.command_set_updated_at();

drop trigger if exists command_connections_updated_at on public.command_app_connections;
create trigger command_connections_updated_at before update on public.command_app_connections
for each row execute function public.command_set_updated_at();

drop trigger if exists command_voice_requests_updated_at on public.command_voice_requests;
create trigger command_voice_requests_updated_at before update on public.command_voice_requests
for each row execute function public.command_set_updated_at();

drop trigger if exists command_agent_runs_updated_at on public.command_agent_runs;
create trigger command_agent_runs_updated_at before update on public.command_agent_runs
for each row execute function public.command_set_updated_at();

drop trigger if exists command_tickets_updated_at on public.command_support_tickets;
create trigger command_tickets_updated_at before update on public.command_support_tickets
for each row execute function public.command_set_updated_at();

drop trigger if exists command_approvals_updated_at on public.command_approvals;
create trigger command_approvals_updated_at before update on public.command_approvals
for each row execute function public.command_set_updated_at();

drop trigger if exists command_outbound_messages_updated_at on public.command_outbound_messages;
create trigger command_outbound_messages_updated_at before update on public.command_outbound_messages
for each row execute function public.command_set_updated_at();

alter table public.command_workspaces enable row level security;
alter table public.command_workspace_members enable row level security;
alter table public.command_clients enable row level security;
alter table public.command_restaurants enable row level security;
alter table public.command_app_connections enable row level security;
alter table public.command_voice_requests enable row level security;
alter table public.command_agent_runs enable row level security;
alter table public.command_support_tickets enable row level security;
alter table public.command_ticket_messages enable row level security;
alter table public.command_approvals enable row level security;
alter table public.command_outbound_messages enable row level security;
alter table public.command_audit_log enable row level security;

drop policy if exists command_workspace_select on public.command_workspaces;
create policy command_workspace_select on public.command_workspaces
for select to authenticated
using (public.command_is_workspace_member(id));

drop policy if exists command_workspace_insert on public.command_workspaces;
create policy command_workspace_insert on public.command_workspaces
for insert to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists command_workspace_update on public.command_workspaces;
create policy command_workspace_update on public.command_workspaces
for update to authenticated
using (public.command_can_manage_workspace(id))
with check (public.command_can_manage_workspace(id));

drop policy if exists command_member_select on public.command_workspace_members;
create policy command_member_select on public.command_workspace_members
for select to authenticated
using (public.command_is_workspace_member(workspace_id));

drop policy if exists command_member_manage on public.command_workspace_members;
create policy command_member_manage on public.command_workspace_members
for all to authenticated
using (public.command_can_manage_workspace(workspace_id))
with check (public.command_can_manage_workspace(workspace_id));

drop policy if exists command_clients_select on public.command_clients;
create policy command_clients_select on public.command_clients
for select to authenticated
using (public.command_is_workspace_member(workspace_id));

drop policy if exists command_restaurants_select on public.command_restaurants;
create policy command_restaurants_select on public.command_restaurants
for select to authenticated
using (public.command_is_workspace_member(workspace_id));

drop policy if exists command_connections_select on public.command_app_connections;
create policy command_connections_select on public.command_app_connections
for select to authenticated
using (public.command_is_workspace_member(workspace_id));

drop policy if exists command_voice_select on public.command_voice_requests;
create policy command_voice_select on public.command_voice_requests
for select to authenticated
using (public.command_is_workspace_member(workspace_id));

drop policy if exists command_agent_runs_select on public.command_agent_runs;
create policy command_agent_runs_select on public.command_agent_runs
for select to authenticated
using (public.command_is_workspace_member(workspace_id));

drop policy if exists command_tickets_select on public.command_support_tickets;
create policy command_tickets_select on public.command_support_tickets
for select to authenticated
using (public.command_is_workspace_member(workspace_id));

drop policy if exists command_ticket_messages_select on public.command_ticket_messages;
create policy command_ticket_messages_select on public.command_ticket_messages
for select to authenticated
using (public.command_is_workspace_member(workspace_id));

drop policy if exists command_approvals_select on public.command_approvals;
create policy command_approvals_select on public.command_approvals
for select to authenticated
using (public.command_is_workspace_member(workspace_id));

drop policy if exists command_outbound_messages_select on public.command_outbound_messages;
create policy command_outbound_messages_select on public.command_outbound_messages
for select to authenticated
using (public.command_is_workspace_member(workspace_id));

drop policy if exists command_audit_select on public.command_audit_log;
create policy command_audit_select on public.command_audit_log
for select to authenticated
using (public.command_is_workspace_member(workspace_id));

-- Les écritures métier sont volontairement réservées aux Edge Functions.
-- Le navigateur lit les données autorisées par RLS et appelle les fonctions sécurisées.
