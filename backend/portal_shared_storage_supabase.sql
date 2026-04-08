create extension if not exists pgcrypto;

create table if not exists public.portal_activity_log (
  id uuid primary key default gen_random_uuid(),
  work_date date,
  created_at timestamptz not null default now(),
  author_name text,
  author_role text,
  platform text,
  contour text,
  title text,
  route text,
  status text,
  items_count integer not null default 0,
  note text,
  storage_label text,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.portal_task_state (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  platform text not null,
  seller_article text not null,
  manager_name text,
  wb_article text,
  ozon_article text,
  item_name text,
  status text not null default 'todo',
  comment text,
  updated_at timestamptz not null default now(),
  unique (work_date, platform, seller_article)
);

create table if not exists public.portal_supply_manual (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null default current_date,
  platform text not null,
  seller_article text not null,
  cluster_name text not null,
  wb_article text,
  ozon_article text,
  in_transit numeric(14,2) not null default 0,
  production numeric(14,2) not null default 0,
  procurement numeric(14,2) not null default 0,
  target_days numeric(14,2),
  seasonality_override numeric(14,2),
  eta_date date,
  comment text,
  updated_at timestamptz not null default now(),
  updated_by text,
  unique (snapshot_date, platform, seller_article, cluster_name)
);

create table if not exists public.portal_order_requests (
  id uuid primary key default gen_random_uuid(),
  request_date date not null default current_date,
  created_at timestamptz not null default now(),
  platform text not null,
  seller_article text not null,
  cluster_name text not null,
  wb_article text,
  ozon_article text,
  recommended_qty numeric(14,2) not null default 0,
  requested_qty numeric(14,2) not null default 0,
  source text,
  priority text,
  eta_date date,
  comment text,
  created_by text
);

alter table public.portal_activity_log enable row level security;
alter table public.portal_task_state enable row level security;
alter table public.portal_supply_manual enable row level security;
alter table public.portal_order_requests enable row level security;

do $$ begin
  create policy portal_activity_log_select_all on public.portal_activity_log for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy portal_activity_log_insert_all on public.portal_activity_log for insert with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy portal_task_state_select_all on public.portal_task_state for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy portal_task_state_insert_all on public.portal_task_state for insert with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy portal_task_state_update_all on public.portal_task_state for update using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy portal_supply_manual_select_all on public.portal_supply_manual for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy portal_supply_manual_insert_all on public.portal_supply_manual for insert with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy portal_supply_manual_update_all on public.portal_supply_manual for update using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy portal_order_requests_select_all on public.portal_order_requests for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy portal_order_requests_insert_all on public.portal_order_requests for insert with check (true);
exception when duplicate_object then null; end $$;
