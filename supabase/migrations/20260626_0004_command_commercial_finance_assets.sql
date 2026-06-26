-- Cook Pilot Command — commercial, finance interne, documents et parc matériel.
-- Dépend de 20260626_0001_command_core.sql.

create table if not exists public.command_catalog_products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  product_code text not null,
  name text not null,
  description text,
  product_type text not null check (product_type in ('software_module','setup','service','equipment_rental','equipment_sale','training','other')),
  billing_interval text check (billing_interval in ('one_time','monthly','quarterly','yearly')),
  default_unit_price_ht numeric(14,2) not null default 0 check (default_unit_price_ht >= 0),
  default_tax_rate numeric(5,2) not null default 20 check (default_tax_rate >= 0 and default_tax_rate <= 100),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, product_code)
);

create table if not exists public.command_quotes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  client_id uuid references public.command_clients(id) on delete set null,
  restaurant_id uuid references public.command_restaurants(id) on delete set null,
  quote_number text not null,
  status text not null default 'draft' check (status in ('draft','awaiting_approval','sent','accepted','rejected','expired','cancelled')),
  issue_date date not null default current_date,
  valid_until date,
  currency char(3) not null default 'EUR',
  subtotal_ht numeric(14,2) not null default 0 check (subtotal_ht >= 0),
  tax_total numeric(14,2) not null default 0 check (tax_total >= 0),
  total_ttc numeric(14,2) not null default 0 check (total_ttc >= 0),
  notes text,
  terms text,
  prepared_by_agent_key text check (prepared_by_agent_key in ('commercial','finance','orchestrator')),
  approval_id uuid references public.command_approvals(id) on delete set null,
  accepted_at timestamptz,
  rejected_at timestamptz,
  signed_document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, quote_number)
);

create table if not exists public.command_quote_lines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  quote_id uuid not null references public.command_quotes(id) on delete cascade,
  catalog_product_id uuid references public.command_catalog_products(id) on delete set null,
  position integer not null check (position > 0),
  label text not null,
  description text,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit text not null default 'unité',
  unit_price_ht numeric(14,2) not null default 0 check (unit_price_ht >= 0),
  tax_rate numeric(5,2) not null default 20 check (tax_rate >= 0 and tax_rate <= 100),
  line_total_ht numeric(14,2) not null default 0 check (line_total_ht >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_id, position)
);

create table if not exists public.command_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  client_id uuid not null references public.command_clients(id) on delete restrict,
  restaurant_id uuid references public.command_restaurants(id) on delete set null,
  subscription_number text not null,
  status text not null default 'pending' check (status in ('pending','active','past_due','paused','cancelled','ended')),
  start_date date not null,
  end_date date,
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly','quarterly','yearly')),
  next_billing_date date,
  currency char(3) not null default 'EUR',
  recurring_amount_ht numeric(14,2) not null default 0 check (recurring_amount_ht >= 0),
  tax_rate numeric(5,2) not null default 20 check (tax_rate >= 0 and tax_rate <= 100),
  payment_terms_days integer not null default 30 check (payment_terms_days >= 0 and payment_terms_days <= 365),
  notes text,
  external_billing_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, subscription_number)
);

create table if not exists public.command_subscription_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  subscription_id uuid not null references public.command_subscriptions(id) on delete cascade,
  catalog_product_id uuid references public.command_catalog_products(id) on delete set null,
  product_code text not null,
  label text not null,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit_price_ht numeric(14,2) not null default 0 check (unit_price_ht >= 0),
  tax_rate numeric(5,2) not null default 20 check (tax_rate >= 0 and tax_rate <= 100),
  is_active boolean not null default true,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.command_invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  client_id uuid references public.command_clients(id) on delete set null,
  restaurant_id uuid references public.command_restaurants(id) on delete set null,
  subscription_id uuid references public.command_subscriptions(id) on delete set null,
  quote_id uuid references public.command_quotes(id) on delete set null,
  invoice_number text not null,
  status text not null default 'draft' check (status in ('draft','awaiting_approval','issued','sent','partially_paid','paid','overdue','cancelled','written_off')),
  issue_date date not null default current_date,
  due_date date,
  currency char(3) not null default 'EUR',
  subtotal_ht numeric(14,2) not null default 0 check (subtotal_ht >= 0),
  tax_total numeric(14,2) not null default 0 check (tax_total >= 0),
  total_ttc numeric(14,2) not null default 0 check (total_ttc >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  balance_due numeric(14,2) not null default 0 check (balance_due >= 0),
  notes text,
  payment_instructions text,
  approval_id uuid references public.command_approvals(id) on delete set null,
  external_invoice_reference text,
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, invoice_number)
);

create table if not exists public.command_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  invoice_id uuid not null references public.command_invoices(id) on delete cascade,
  catalog_product_id uuid references public.command_catalog_products(id) on delete set null,
  position integer not null check (position > 0),
  label text not null,
  description text,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit text not null default 'unité',
  unit_price_ht numeric(14,2) not null default 0 check (unit_price_ht >= 0),
  tax_rate numeric(5,2) not null default 20 check (tax_rate >= 0 and tax_rate <= 100),
  line_total_ht numeric(14,2) not null default 0 check (line_total_ht >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, position)
);

create table if not exists public.command_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  invoice_id uuid not null references public.command_invoices(id) on delete cascade,
  payment_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  currency char(3) not null default 'EUR',
  method text not null check (method in ('bank_transfer','card','direct_debit','cash','cheque','other')),
  status text not null default 'recorded' check (status in ('pending','recorded','failed','refunded','cancelled')),
  external_reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.command_vendors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  name text not null,
  category text not null default 'other' check (category in ('hosting','ai','email','sms','telecom','insurance','accounting','equipment','software','marketing','other')),
  contact_name text,
  email text,
  phone text,
  website text,
  payment_terms_days integer not null default 30 check (payment_terms_days >= 0 and payment_terms_days <= 365),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.command_expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  vendor_id uuid references public.command_vendors(id) on delete set null,
  expense_number text,
  category text not null check (category in ('hosting','ai','email','sms','telecom','insurance','accounting','equipment','marketing','travel','payroll','tax','other')),
  status text not null default 'draft' check (status in ('draft','to_review','approved','scheduled','paid','rejected','cancelled')),
  expense_date date not null default current_date,
  due_date date,
  currency char(3) not null default 'EUR',
  amount_ht numeric(14,2) not null default 0 check (amount_ht >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  amount_ttc numeric(14,2) not null default 0 check (amount_ttc >= 0),
  recurring_cost_id uuid,
  description text,
  approval_id uuid references public.command_approvals(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, expense_number)
);

create table if not exists public.command_recurring_costs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  vendor_id uuid references public.command_vendors(id) on delete set null,
  label text not null,
  category text not null check (category in ('hosting','ai','email','sms','telecom','insurance','accounting','equipment','marketing','other')),
  billing_interval text not null check (billing_interval in ('monthly','quarterly','yearly')),
  amount_ht numeric(14,2) not null default 0 check (amount_ht >= 0),
  tax_rate numeric(5,2) not null default 20 check (tax_rate >= 0 and tax_rate <= 100),
  next_due_date date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.command_expenses
  add constraint command_expenses_recurring_cost_fk
  foreign key (recurring_cost_id) references public.command_recurring_costs(id) on delete set null;

create table if not exists public.command_cashflow_forecasts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  forecast_date date not null,
  forecast_type text not null check (forecast_type in ('revenue','expense','cash_position','mrr','arr')),
  amount numeric(14,2) not null,
  currency char(3) not null default 'EUR',
  source text not null check (source in ('subscription','invoice','expense','manual','agent')),
  confidence numeric(5,2) check (confidence >= 0 and confidence <= 100),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.command_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  storage_bucket text not null default 'command-private',
  storage_path text not null,
  document_category text not null check (document_category in ('quote','invoice','expense','contract','support','equipment','report','other')),
  source_type text not null check (source_type in ('upload','scan','generated','email','system')),
  file_name text not null,
  mime_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  checksum_sha256 text,
  linked_entity_type text,
  linked_entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, storage_bucket, storage_path)
);

create table if not exists public.command_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  asset_tag text not null,
  asset_type text not null check (asset_type in ('tablet','thermometer','label_printer','barcode_scanner','cable','router','other')),
  brand text,
  model text,
  serial_number text,
  purchase_date date,
  purchase_price_ht numeric(14,2) check (purchase_price_ht is null or purchase_price_ht >= 0),
  lifecycle_status text not null default 'in_stock' check (lifecycle_status in ('in_stock','prepared','installed','rented','maintenance','returned','lost','retired')),
  warranty_until date,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, asset_tag),
  unique (workspace_id, serial_number)
);

create table if not exists public.command_rental_contracts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  client_id uuid not null references public.command_clients(id) on delete restrict,
  restaurant_id uuid references public.command_restaurants(id) on delete set null,
  contract_number text not null,
  status text not null default 'draft' check (status in ('draft','awaiting_signature','active','paused','ended','cancelled')),
  start_date date,
  end_date date,
  currency char(3) not null default 'EUR',
  monthly_rental_ht numeric(14,2) not null default 0 check (monthly_rental_ht >= 0),
  deposit_amount numeric(14,2) not null default 0 check (deposit_amount >= 0),
  terms text,
  signed_document_id uuid references public.command_documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, contract_number)
);

create table if not exists public.command_asset_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  asset_id uuid not null references public.command_assets(id) on delete cascade,
  restaurant_id uuid references public.command_restaurants(id) on delete set null,
  rental_contract_id uuid references public.command_rental_contracts(id) on delete set null,
  assignment_type text not null check (assignment_type in ('rental','installation','demo','internal','maintenance')),
  status text not null default 'active' check (status in ('planned','active','returned','cancelled')),
  assigned_at timestamptz not null default now(),
  returned_at timestamptz,
  condition_out text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.command_asset_maintenance (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.command_workspaces(id) on delete cascade,
  asset_id uuid not null references public.command_assets(id) on delete cascade,
  restaurant_id uuid references public.command_restaurants(id) on delete set null,
  maintenance_type text not null check (maintenance_type in ('inspection','repair','replacement','loss','other')),
  status text not null default 'open' check (status in ('open','in_progress','completed','cancelled')),
  description text not null,
  cost_ht numeric(14,2) check (cost_ht is null or cost_ht >= 0),
  opened_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists command_catalog_workspace_idx on public.command_catalog_products(workspace_id, is_active);
create index if not exists command_quotes_workspace_idx on public.command_quotes(workspace_id, status, issue_date desc);
create index if not exists command_subscriptions_workspace_idx on public.command_subscriptions(workspace_id, status, next_billing_date);
create index if not exists command_invoices_workspace_idx on public.command_invoices(workspace_id, status, due_date);
create index if not exists command_payments_invoice_idx on public.command_payments(invoice_id, payment_date desc);
create index if not exists command_vendors_workspace_idx on public.command_vendors(workspace_id, category, is_active);
create index if not exists command_expenses_workspace_idx on public.command_expenses(workspace_id, status, due_date);
create index if not exists command_recurring_costs_workspace_idx on public.command_recurring_costs(workspace_id, is_active, next_due_date);
create index if not exists command_cashflow_workspace_idx on public.command_cashflow_forecasts(workspace_id, forecast_type, forecast_date);
create index if not exists command_documents_workspace_idx on public.command_documents(workspace_id, document_category, created_at desc);
create index if not exists command_assets_workspace_idx on public.command_assets(workspace_id, lifecycle_status, asset_type);
create index if not exists command_assignments_asset_idx on public.command_asset_assignments(asset_id, status, assigned_at desc);
create index if not exists command_rental_contracts_workspace_idx on public.command_rental_contracts(workspace_id, status, start_date);
create index if not exists command_asset_maintenance_asset_idx on public.command_asset_maintenance(asset_id, status, opened_at desc);

drop trigger if exists command_catalog_products_updated_at on public.command_catalog_products;
create trigger command_catalog_products_updated_at before update on public.command_catalog_products
for each row execute function public.command_set_updated_at();

drop trigger if exists command_quotes_updated_at on public.command_quotes;
create trigger command_quotes_updated_at before update on public.command_quotes
for each row execute function public.command_set_updated_at();

drop trigger if exists command_quote_lines_updated_at on public.command_quote_lines;
create trigger command_quote_lines_updated_at before update on public.command_quote_lines
for each row execute function public.command_set_updated_at();

drop trigger if exists command_subscriptions_updated_at on public.command_subscriptions;
create trigger command_subscriptions_updated_at before update on public.command_subscriptions
for each row execute function public.command_set_updated_at();

drop trigger if exists command_subscription_items_updated_at on public.command_subscription_items;
create trigger command_subscription_items_updated_at before update on public.command_subscription_items
for each row execute function public.command_set_updated_at();

drop trigger if exists command_invoices_updated_at on public.command_invoices;
create trigger command_invoices_updated_at before update on public.command_invoices
for each row execute function public.command_set_updated_at();

drop trigger if exists command_invoice_lines_updated_at on public.command_invoice_lines;
create trigger command_invoice_lines_updated_at before update on public.command_invoice_lines
for each row execute function public.command_set_updated_at();

drop trigger if exists command_payments_updated_at on public.command_payments;
create trigger command_payments_updated_at before update on public.command_payments
for each row execute function public.command_set_updated_at();

drop trigger if exists command_vendors_updated_at on public.command_vendors;
create trigger command_vendors_updated_at before update on public.command_vendors
for each row execute function public.command_set_updated_at();

drop trigger if exists command_expenses_updated_at on public.command_expenses;
create trigger command_expenses_updated_at before update on public.command_expenses
for each row execute function public.command_set_updated_at();

drop trigger if exists command_recurring_costs_updated_at on public.command_recurring_costs;
create trigger command_recurring_costs_updated_at before update on public.command_recurring_costs
for each row execute function public.command_set_updated_at();

drop trigger if exists command_cashflow_forecasts_updated_at on public.command_cashflow_forecasts;
create trigger command_cashflow_forecasts_updated_at before update on public.command_cashflow_forecasts
for each row execute function public.command_set_updated_at();

drop trigger if exists command_assets_updated_at on public.command_assets;
create trigger command_assets_updated_at before update on public.command_assets
for each row execute function public.command_set_updated_at();

drop trigger if exists command_rental_contracts_updated_at on public.command_rental_contracts;
create trigger command_rental_contracts_updated_at before update on public.command_rental_contracts
for each row execute function public.command_set_updated_at();

drop trigger if exists command_asset_assignments_updated_at on public.command_asset_assignments;
create trigger command_asset_assignments_updated_at before update on public.command_asset_assignments
for each row execute function public.command_set_updated_at();

drop trigger if exists command_asset_maintenance_updated_at on public.command_asset_maintenance;
create trigger command_asset_maintenance_updated_at before update on public.command_asset_maintenance
for each row execute function public.command_set_updated_at();

alter table public.command_catalog_products enable row level security;
alter table public.command_quotes enable row level security;
alter table public.command_quote_lines enable row level security;
alter table public.command_subscriptions enable row level security;
alter table public.command_subscription_items enable row level security;
alter table public.command_invoices enable row level security;
alter table public.command_invoice_lines enable row level security;
alter table public.command_payments enable row level security;
alter table public.command_vendors enable row level security;
alter table public.command_expenses enable row level security;
alter table public.command_recurring_costs enable row level security;
alter table public.command_cashflow_forecasts enable row level security;
alter table public.command_documents enable row level security;
alter table public.command_assets enable row level security;
alter table public.command_rental_contracts enable row level security;
alter table public.command_asset_assignments enable row level security;
alter table public.command_asset_maintenance enable row level security;

create policy command_catalog_select on public.command_catalog_products for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_quotes_select on public.command_quotes for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_quote_lines_select on public.command_quote_lines for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_subscriptions_select on public.command_subscriptions for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_subscription_items_select on public.command_subscription_items for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_invoices_select on public.command_invoices for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_invoice_lines_select on public.command_invoice_lines for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_payments_select on public.command_payments for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_vendors_select on public.command_vendors for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_expenses_select on public.command_expenses for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_recurring_costs_select on public.command_recurring_costs for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_cashflow_select on public.command_cashflow_forecasts for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_documents_select on public.command_documents for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_assets_select on public.command_assets for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_rental_contracts_select on public.command_rental_contracts for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_asset_assignments_select on public.command_asset_assignments for select to authenticated using (public.command_is_workspace_member(workspace_id));
create policy command_asset_maintenance_select on public.command_asset_maintenance for select to authenticated using (public.command_is_workspace_member(workspace_id));

-- Écritures métier réservées aux Edge Functions. Les documents pointent vers un bucket privé.
