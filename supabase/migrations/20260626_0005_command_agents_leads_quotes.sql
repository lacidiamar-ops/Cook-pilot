-- Cook Pilot Command — agents distincts, prospection et collaboration inter-agents.
-- Dépend des migrations 0001 à 0004.

create table if not exists public.command_agent_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  agent_key text not null check (agent_key in ('technical','support','commercial','prospecting')),
  display_name text not null,
  provider text not null check (provider in ('zai_glm','deepseek')),
  model_id text not null,
  status text not null default 'active' check (status in ('active','paused','maintenance')),
  capabilities jsonb not null default '[]'::jsonb,
  guardrails jsonb not null default '[]'::jsonb,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, agent_key)
);

create table if not exists public.command_leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  restaurant_id uuid references public.command_restaurants(id) on delete set null,
  company_name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  city text,
  source text not null default 'manual' check (source in ('manual','referral','website','event','outreach','other')),
  status text not null default 'new' check (status in ('new','qualified','proposal','won','lost','archived')),
  score integer not null default 0 check (score between 0 and 100),
  qualification jsonb not null default '{}'::jsonb,
  notes text,
  owner_agent_key text not null default 'prospecting' check (owner_agent_key in ('technical','support','commercial','prospecting')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.command_lead_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  lead_id uuid not null references public.command_leads(id) on delete cascade,
  activity_type text not null check (activity_type in ('note','qualification','research','outreach_draft','meeting','handoff','status_change','other')),
  author_type text not null check (author_type in ('agent','founder','system')),
  agent_key text check (agent_key in ('technical','support','commercial','prospecting')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.command_agent_handoffs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  from_agent_key text not null check (from_agent_key in ('technical','support','commercial','prospecting','orchestrator')),
  to_agent_key text not null check (to_agent_key in ('technical','support','commercial','prospecting')),
  lead_id uuid references public.command_leads(id) on delete set null,
  quote_id uuid references public.command_quotes(id) on delete set null,
  ticket_id uuid references public.command_support_tickets(id) on delete set null,
  mission_id uuid references public.command_agent_runs(id) on delete set null,
  subject text not null,
  context text not null,
  status text not null default 'open' check (status in ('open','acknowledged','completed','cancelled')),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.command_quotes
  add column if not exists lead_id uuid references public.command_leads(id) on delete set null,
  add column if not exists sales_agent_key text check (sales_agent_key in ('commercial','prospecting')),
  add column if not exists sent_at timestamptz,
  add column if not exists approval_requested_at timestamptz;

alter table public.command_approvals
  add column if not exists quote_id uuid references public.command_quotes(id) on delete set null,
  add column if not exists lead_id uuid references public.command_leads(id) on delete set null,
  add column if not exists handoff_id uuid references public.command_agent_handoffs(id) on delete set null;

create index if not exists command_agent_profiles_workspace_idx on public.command_agent_profiles(workspace_id, status);
create index if not exists command_leads_workspace_idx on public.command_leads(workspace_id, status, score desc);
create index if not exists command_lead_activities_lead_idx on public.command_lead_activities(lead_id, created_at desc);
create index if not exists command_agent_handoffs_workspace_idx on public.command_agent_handoffs(workspace_id, status, created_at desc);
create index if not exists command_agent_handoffs_lead_idx on public.command_agent_handoffs(lead_id, status);

create or replace function public.command_seed_default_agents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.command_agent_profiles (workspace_id, agent_key, display_name, provider, model_id, capabilities, guardrails)
  values
    (new.id, 'technical', 'Agent technique Cook Pilot', 'zai_glm', 'glm-5.2',
      '["diagnostic incidents", "analyse logs", "architecture", "proposition correctifs", "préparation déploiement"]'::jsonb,
      '["ne déploie pas en production sans validation", "ne réinitialise pas un accès sans validation", "transfère la communication client au support"]'::jsonb),
    (new.id, 'support', 'Agent support Cook Pilot', 'deepseek', 'deepseek-v4-pro',
      '["triage tickets", "réponse client", "base de connaissances", "suivi incidents", "création de tickets"]'::jsonb,
      '["ne consulte pas les données RH sensibles", "escalade les bugs au technique", "ne modifie pas les accès sensibles"]'::jsonb),
    (new.id, 'commercial', 'Agent commercial Cook Pilot', 'deepseek', 'deepseek-v4-pro',
      '["création devis", "proposition modules", "qualification besoin", "relance commerciale", "préparation contrat"]'::jsonb,
      '["ne change pas les prix hors catalogue sans validation", "ne signe ni n’envoie un devis sensible sans validation", "demande la qualification au prospecting si nécessaire"]'::jsonb),
    (new.id, 'prospecting', 'Agent prospection Cook Pilot', 'deepseek', 'deepseek-v4-pro',
      '["qualification leads", "scoring", "recherche entreprise", "séquences de prospection", "passage au commercial"]'::jsonb,
      '["ne lance pas de campagne massive sans validation", "ne promet pas de conditions commerciales", "transmet les opportunités qualifiées au commercial"]'::jsonb)
  on conflict (workspace_id, agent_key) do nothing;
  return new;
end;
$$;

drop trigger if exists command_workspace_seed_agents on public.command_workspaces;
create trigger command_workspace_seed_agents
after insert on public.command_workspaces
for each row execute function public.command_seed_default_agents();

drop trigger if exists command_agent_profiles_updated_at on public.command_agent_profiles;
create trigger command_agent_profiles_updated_at before update on public.command_agent_profiles
for each row execute function public.command_set_updated_at();

drop trigger if exists command_leads_updated_at on public.command_leads;
create trigger command_leads_updated_at before update on public.command_leads
for each row execute function public.command_set_updated_at();

drop trigger if exists command_agent_handoffs_updated_at on public.command_agent_handoffs;
create trigger command_agent_handoffs_updated_at before update on public.command_agent_handoffs
for each row execute function public.command_set_updated_at();

alter table public.command_agent_profiles enable row level security;
alter table public.command_leads enable row level security;
alter table public.command_lead_activities enable row level security;
alter table public.command_agent_handoffs enable row level security;

create policy command_agent_profiles_select on public.command_agent_profiles
for select to authenticated using (public.command_is_workspace_member(workspace_id));

create policy command_leads_select on public.command_leads
for select to authenticated using (public.command_is_workspace_member(workspace_id));

create policy command_lead_activities_select on public.command_lead_activities
for select to authenticated using (public.command_is_workspace_member(workspace_id));

create policy command_agent_handoffs_select on public.command_agent_handoffs
for select to authenticated using (public.command_is_workspace_member(workspace_id));

-- Les écritures restent réservées aux Edge Functions et aux tâches serveur.
