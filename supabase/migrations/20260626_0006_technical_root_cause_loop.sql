-- Cook Pilot Command — boucle technique obligatoire : cause racine, régression, gate de release.
-- Dépend des migrations Command précédentes.

create table if not exists public.command_technical_incidents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  support_ticket_id uuid references public.command_support_tickets(id) on delete set null,
  source_agent_run_id uuid references public.command_agent_runs(id) on delete set null,
  title text not null,
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  status text not null default 'observed' check (status in ('observed','reproducing','investigating','root_cause_confirmed','fix_designed','verifying','regression_testing','canary','closed','blocked')),
  root_cause_summary text,
  root_cause_confidence numeric(4,3) not null default 0 check (root_cause_confidence >= 0 and root_cause_confidence <= 1),
  root_cause_confirmed_at timestamptz,
  reproduction_status text not null default 'not_started' check (reproduction_status in ('not_started','reproduced','not_reproduced','intermittent')),
  dependency_map jsonb not null default '{}'::jsonb,
  affected_components jsonb not null default '[]'::jsonb,
  fix_strategy text not null default 'root_fix' check (fix_strategy in ('root_fix','workaround')),
  root_fix_reference text,
  rollback_reference text,
  owner_agent_key text not null default 'technical' check (owner_agent_key = 'technical'),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'closed' or (root_cause_confirmed_at is not null and fix_strategy = 'root_fix'))
);

create table if not exists public.command_technical_iterations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  incident_id uuid not null references public.command_technical_incidents(id) on delete cascade,
  iteration_number integer not null check (iteration_number > 0),
  phase text not null check (phase in ('observation','reproduction','dependency_mapping','hypothesis','experiment','root_fix_design','verification','regression','canary','postmortem')),
  evidence jsonb not null default '{}'::jsonb,
  hypothesis text,
  experiment text,
  result text,
  root_cause_candidate boolean not null default false,
  confidence numeric(4,3) not null default 0 check (confidence >= 0 and confidence <= 1),
  code_reference text,
  created_by_agent_key text not null default 'technical' check (created_by_agent_key = 'technical'),
  created_at timestamptz not null default now(),
  unique (incident_id, iteration_number)
);

create table if not exists public.command_technical_regression_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  incident_id uuid not null references public.command_technical_incidents(id) on delete cascade,
  iteration_id uuid references public.command_technical_iterations(id) on delete set null,
  environment text not null check (environment in ('local','preview','staging','canary','production')),
  test_scope jsonb not null default '[]'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','passed','failed','cancelled')),
  summary text,
  report_reference text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.command_technical_release_gates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  incident_id uuid not null references public.command_technical_incidents(id) on delete cascade,
  gate_key text not null check (gate_key in ('root_cause_confirmed','reproduction_passed','regression_passed','rollback_ready','founder_approval','canary_healthy')),
  status text not null default 'pending' check (status in ('pending','passed','failed','waived')),
  evidence jsonb not null default '{}'::jsonb,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (incident_id, gate_key)
);

create index if not exists command_technical_incidents_workspace_idx on public.command_technical_incidents(workspace_id, status, severity);
create index if not exists command_technical_iterations_incident_idx on public.command_technical_iterations(incident_id, iteration_number desc);
create index if not exists command_technical_regression_incident_idx on public.command_technical_regression_runs(incident_id, status, created_at desc);
create index if not exists command_technical_release_gates_incident_idx on public.command_technical_release_gates(incident_id, status);

create or replace function public.command_guard_technical_incident_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'closed' then
    if new.fix_strategy <> 'root_fix' or new.root_cause_confirmed_at is null then
      raise exception 'Un incident ne peut pas être fermé sur un workaround ou sans cause racine confirmée';
    end if;

    if not exists (
      select 1
      from public.command_technical_regression_runs regression
      where regression.incident_id = new.id
        and regression.status = 'passed'
        and regression.environment in ('preview','staging','canary')
    ) then
      raise exception 'Un incident ne peut pas être fermé sans régression validée hors production';
    end if;
  end if;

  if new.status = 'root_cause_confirmed' and (new.root_cause_summary is null or new.reproduction_status not in ('reproduced','intermittent')) then
    raise exception 'La cause racine doit être documentée et le défaut doit être reproduit ou identifié comme intermittent';
  end if;

  return new;
end;
$$;

drop trigger if exists command_technical_incident_close_guard on public.command_technical_incidents;
create trigger command_technical_incident_close_guard
before insert or update on public.command_technical_incidents
for each row execute function public.command_guard_technical_incident_close();

drop trigger if exists command_technical_incidents_updated_at on public.command_technical_incidents;
create trigger command_technical_incidents_updated_at before update on public.command_technical_incidents
for each row execute function public.command_set_updated_at();

drop trigger if exists command_technical_release_gates_updated_at on public.command_technical_release_gates;
create trigger command_technical_release_gates_updated_at before update on public.command_technical_release_gates
for each row execute function public.command_set_updated_at();

alter table public.command_technical_incidents enable row level security;
alter table public.command_technical_iterations enable row level security;
alter table public.command_technical_regression_runs enable row level security;
alter table public.command_technical_release_gates enable row level security;

create policy command_technical_incidents_select on public.command_technical_incidents
for select to authenticated using (public.command_is_workspace_member(workspace_id));

create policy command_technical_iterations_select on public.command_technical_iterations
for select to authenticated using (public.command_is_workspace_member(workspace_id));

create policy command_technical_regression_runs_select on public.command_technical_regression_runs
for select to authenticated using (public.command_is_workspace_member(workspace_id));

create policy command_technical_release_gates_select on public.command_technical_release_gates
for select to authenticated using (public.command_is_workspace_member(workspace_id));

-- Les écritures passent uniquement par les Edge Functions et les workers autorisés.
