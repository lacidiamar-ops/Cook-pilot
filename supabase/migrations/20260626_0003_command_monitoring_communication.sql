-- Cook Pilot Command — supervision applicative et communication restaurants.
-- Dépend de 20260626_0001_command_core.sql.

create table if not exists public.command_restaurant_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  restaurant_id uuid not null references public.command_restaurants(id) on delete cascade,
  display_name text not null,
  email text,
  phone text,
  role_label text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  preferred_channel text not null default 'email' check (preferred_channel in ('email','chat','voice','in_app')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, email)
);

create table if not exists public.command_app_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  restaurant_id uuid not null references public.command_restaurants(id) on delete cascade,
  app_connection_id uuid not null references public.command_app_connections(id) on delete cascade,
  external_event_id text,
  event_category text not null check (event_category in ('auth','error','usage','sync','deployment','billing','security','scan','support','other')),
  event_name text not null,
  severity text not null default 'info' check (severity in ('debug','info','warning','error','critical')),
  message text,
  payload jsonb not null default '{}'::jsonb,
  payload_is_redacted boolean not null default true,
  dedupe_key text,
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (app_connection_id, external_event_id),
  unique (app_connection_id, dedupe_key)
);

create table if not exists public.command_incidents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  restaurant_id uuid references public.command_restaurants(id) on delete set null,
  app_connection_id uuid references public.command_app_connections(id) on delete set null,
  support_ticket_id uuid references public.command_support_tickets(id) on delete set null,
  status text not null default 'open' check (status in ('open','investigating','waiting_approval','monitoring','resolved','closed')),
  severity text not null default 'warning' check (severity in ('info','warning','error','critical')),
  category text not null default 'technical',
  title text not null,
  summary text,
  impact_summary text,
  root_cause text,
  resolution text,
  detected_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  assigned_agent_key text not null default 'technical' check (assigned_agent_key in ('technical','finance','commercial','customer_success','journal','marketing','orchestrator')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.command_incident_events (
  incident_id uuid not null references public.command_incidents(id) on delete cascade,
  app_event_id uuid not null references public.command_app_events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (incident_id, app_event_id)
);

create table if not exists public.command_sync_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  restaurant_id uuid not null references public.command_restaurants(id) on delete cascade,
  app_connection_id uuid not null references public.command_app_connections(id) on delete cascade,
  sync_type text not null check (sync_type in ('health_check','events','usage','deployment','client','manual','other')),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  cursor_reference text,
  records_received integer not null default 0 check (records_received >= 0),
  records_rejected integer not null default 0 check (records_rejected >= 0),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.command_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  restaurant_id uuid references public.command_restaurants(id) on delete set null,
  contact_id uuid references public.command_restaurant_contacts(id) on delete set null,
  ticket_id uuid references public.command_support_tickets(id) on delete set null,
  app_connection_id uuid references public.command_app_connections(id) on delete set null,
  subject text,
  channel text not null default 'chat' check (channel in ('chat','email','voice','mixed')),
  status text not null default 'open' check (status in ('open','waiting_restaurant','waiting_cook_pilot','closed')),
  assigned_agent_key text not null default 'technical' check (assigned_agent_key in ('technical','finance','commercial','customer_success','journal','marketing')),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.command_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  conversation_id uuid not null references public.command_conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound','internal')),
  sender_type text not null check (sender_type in ('restaurant_contact','agent','founder','system')),
  sender_user_id uuid references auth.users(id) on delete set null,
  agent_key text,
  channel text not null check (channel in ('chat','email','voice','system')),
  content text not null,
  voice_transcript text,
  metadata jsonb not null default '{}'::jsonb,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.command_message_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  template_key text not null,
  name text not null,
  category text not null check (category in ('support','incident','journal','commercial','finance','onboarding','other')),
  subject_template text,
  body_template text not null,
  channel text not null default 'email' check (channel in ('email','in_app','chat')),
  requires_approval boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, template_key)
);

create table if not exists public.command_journal_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  product_code text check (product_code in ('gestion','human','haccp','scan','command')),
  category text not null check (category in ('update','maintenance','tip','training','security','commercial','other')),
  title text not null,
  summary text,
  body_markdown text not null,
  status text not null default 'draft' check (status in ('draft','awaiting_approval','scheduled','published','archived')),
  prepared_by_agent_key text check (prepared_by_agent_key in ('technical','finance','commercial','customer_success','journal','marketing','orchestrator')),
  approval_id uuid references public.command_approvals(id) on delete set null,
  publish_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.command_journal_publications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  journal_post_id uuid not null references public.command_journal_posts(id) on delete cascade,
  restaurant_id uuid references public.command_restaurants(id) on delete cascade,
  product_code text check (product_code in ('gestion','human','haccp','scan','command')),
  channel text not null check (channel in ('email','in_app','chat')),
  status text not null default 'queued' check (status in ('queued','sent','failed','cancelled')),
  provider_message_reference text,
  sent_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.command_journal_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  publication_id uuid not null references public.command_journal_publications(id) on delete cascade,
  contact_id uuid references public.command_restaurant_contacts(id) on delete set null,
  recipient_email text,
  delivered_at timestamptz,
  opened_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.command_release_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  product_code text not null check (product_code in ('gestion','human','haccp','scan','command')),
  version text not null,
  title text not null,
  changes jsonb not null default '[]'::jsonb,
  release_status text not null default 'draft' check (release_status in ('draft','approved','deployed','rolled_back')),
  approval_id uuid references public.command_approvals(id) on delete set null,
  deployed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, product_code, version)
);

create table if not exists public.command_release_deployments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  release_note_id uuid not null references public.command_release_notes(id) on delete cascade,
  restaurant_id uuid references public.command_restaurants(id) on delete cascade,
  app_connection_id uuid references public.command_app_connections(id) on delete cascade,
  status text not null default 'scheduled' check (status in ('scheduled','deploying','deployed','failed','rolled_back')),
  deployed_at timestamptz,
  rolled_back_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists command_contacts_restaurant_idx on public.command_restaurant_contacts(restaurant_id, is_active);
create index if not exists command_app_events_connection_idx on public.command_app_events(app_connection_id, occurred_at desc);
create index if not exists command_app_events_workspace_idx on public.command_app_events(workspace_id, severity, occurred_at desc);
create index if not exists command_incidents_workspace_idx on public.command_incidents(workspace_id, status, severity, detected_at desc);
create index if not exists command_sync_runs_connection_idx on public.command_sync_runs(app_connection_id, created_at desc);
create index if not exists command_conversations_workspace_idx on public.command_conversations(workspace_id, status, last_message_at desc);
create index if not exists command_conversation_messages_conversation_idx on public.command_conversation_messages(conversation_id, created_at asc);
create index if not exists command_journal_posts_workspace_idx on public.command_journal_posts(workspace_id, status, publish_at desc);
create index if not exists command_journal_publications_post_idx on public.command_journal_publications(journal_post_id, status);
create index if not exists command_release_notes_workspace_idx on public.command_release_notes(workspace_id, product_code, release_status);
create index if not exists command_release_deployments_release_idx on public.command_release_deployments(release_note_id, status);

create or replace function public.command_touch_conversation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.command_conversations
     set last_message_at = new.created_at,
         updated_at = now(),
         status = case when new.direction = 'inbound' then 'waiting_cook_pilot' else 'waiting_restaurant' end
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists command_contacts_updated_at on public.command_restaurant_contacts;
create trigger command_contacts_updated_at before update on public.command_restaurant_contacts
for each row execute function public.command_set_updated_at();

drop trigger if exists command_incidents_updated_at on public.command_incidents;
create trigger command_incidents_updated_at before update on public.command_incidents
for each row execute function public.command_set_updated_at();

drop trigger if exists command_sync_runs_updated_at on public.command_sync_runs;
create trigger command_sync_runs_updated_at before update on public.command_sync_runs
for each row execute function public.command_set_updated_at();

drop trigger if exists command_conversations_updated_at on public.command_conversations;
create trigger command_conversations_updated_at before update on public.command_conversations
for each row execute function public.command_set_updated_at();

drop trigger if exists command_templates_updated_at on public.command_message_templates;
create trigger command_templates_updated_at before update on public.command_message_templates
for each row execute function public.command_set_updated_at();

drop trigger if exists command_journal_posts_updated_at on public.command_journal_posts;
create trigger command_journal_posts_updated_at before update on public.command_journal_posts
for each row execute function public.command_set_updated_at();

drop trigger if exists command_journal_publications_updated_at on public.command_journal_publications;
create trigger command_journal_publications_updated_at before update on public.command_journal_publications
for each row execute function public.command_set_updated_at();

drop trigger if exists command_release_notes_updated_at on public.command_release_notes;
create trigger command_release_notes_updated_at before update on public.command_release_notes
for each row execute function public.command_set_updated_at();

drop trigger if exists command_release_deployments_updated_at on public.command_release_deployments;
create trigger command_release_deployments_updated_at before update on public.command_release_deployments
for each row execute function public.command_set_updated_at();

drop trigger if exists command_conversation_message_touch on public.command_conversation_messages;
create trigger command_conversation_message_touch after insert on public.command_conversation_messages
for each row execute function public.command_touch_conversation();

alter table public.command_restaurant_contacts enable row level security;
alter table public.command_app_events enable row level security;
alter table public.command_incidents enable row level security;
alter table public.command_incident_events enable row level security;
alter table public.command_sync_runs enable row level security;
alter table public.command_conversations enable row level security;
alter table public.command_conversation_messages enable row level security;
alter table public.command_message_templates enable row level security;
alter table public.command_journal_posts enable row level security;
alter table public.command_journal_publications enable row level security;
alter table public.command_journal_receipts enable row level security;
alter table public.command_release_notes enable row level security;
alter table public.command_release_deployments enable row level security;

create policy command_contacts_select on public.command_restaurant_contacts for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_app_events_select on public.command_app_events for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_incidents_select on public.command_incidents for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_incident_events_select on public.command_incident_events for select to authenticated using (exists (select 1 from public.command_incidents incident where incident.id = incident_id and public.command_is_workspace_member(incident.workspace_id)));
create policy command_sync_runs_select on public.command_sync_runs for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_conversations_select on public.command_conversations for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_conversation_messages_select on public.command_conversation_messages for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_templates_select on public.command_message_templates for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_journal_posts_select on public.command_journal_posts for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_journal_publications_select on public.command_journal_publications for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_journal_receipts_select on public.command_journal_receipts for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_release_notes_select on public.command_release_notes for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_release_deployments_select on public.command_release_deployments for select to authenticated using (public.command_is_workspace_member(workspace_id));

-- Écritures uniquement depuis les Edge Functions / jobs serveur.
