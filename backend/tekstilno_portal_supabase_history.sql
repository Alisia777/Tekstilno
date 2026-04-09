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

alter table public.portal_task_state
  add column if not exists assignee_name text,
  add column if not exists priority text,
  add column if not exists focus_comment text,
  add column if not exists manager_comment text,
  add column if not exists leader_comment text,
  add column if not exists due_at timestamptz,
  add column if not exists updated_by text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

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

create table if not exists public.portal_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.portal_task_state(id) on delete cascade,
  work_date date not null,
  platform text not null,
  seller_article text not null,
  wb_article text,
  ozon_article text,
  manager_name text,
  author_name text not null,
  author_role text not null default 'manager',
  comment_type text not null default 'comment',
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  is_deleted boolean not null default false,
  meta jsonb not null default '{}'::jsonb
);

create table if not exists public.portal_entity_history (
  id bigserial primary key,
  entity_type text not null,
  entity_key text not null,
  work_date date,
  platform text,
  seller_article text,
  wb_article text,
  ozon_article text,
  manager_name text,
  actor_name text,
  actor_role text,
  event_type text not null,
  changed_fields text[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);

create index if not exists idx_portal_task_state_main
  on public.portal_task_state (work_date desc, platform, seller_article);
create index if not exists idx_portal_task_comments_main
  on public.portal_task_comments (work_date desc, platform, seller_article, created_at desc);
create index if not exists idx_portal_entity_history_main
  on public.portal_entity_history (created_at desc, entity_type, platform, seller_article);
create index if not exists idx_portal_entity_history_manager
  on public.portal_entity_history (work_date desc, manager_name, actor_name);

create or replace function public.portal_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_portal_task_state_updated_at on public.portal_task_state;
create trigger trg_portal_task_state_updated_at
before update on public.portal_task_state
for each row
execute function public.portal_touch_updated_at();

drop trigger if exists trg_portal_supply_manual_updated_at on public.portal_supply_manual;
create trigger trg_portal_supply_manual_updated_at
before update on public.portal_supply_manual
for each row
execute function public.portal_touch_updated_at();

create or replace function public.portal_log_task_state_history()
returns trigger
language plpgsql
as $$
declare
  changed text[] := '{}';
  actor text;
begin
  actor := coalesce(new.updated_by, new.assignee_name, new.manager_name, 'portal');

  if tg_op = 'INSERT' then
    insert into public.portal_entity_history (
      entity_type, entity_key, work_date, platform, seller_article, wb_article, ozon_article,
      manager_name, actor_name, actor_role, event_type, changed_fields, note, old_data, new_data
    ) values (
      'task', concat_ws('|', new.work_date::text, new.platform, new.seller_article),
      new.work_date, new.platform, new.seller_article, new.wb_article, new.ozon_article,
      coalesce(new.assignee_name, new.manager_name), actor, 'portal', 'created',
      array['status','comment'], coalesce(new.focus_comment, new.comment, new.manager_comment, new.leader_comment),
      null, to_jsonb(new)
    );
    return new;
  end if;

  if new.status is distinct from old.status then changed := array_append(changed, 'status'); end if;
  if new.comment is distinct from old.comment then changed := array_append(changed, 'comment'); end if;
  if new.manager_comment is distinct from old.manager_comment then changed := array_append(changed, 'manager_comment'); end if;
  if new.leader_comment is distinct from old.leader_comment then changed := array_append(changed, 'leader_comment'); end if;
  if new.priority is distinct from old.priority then changed := array_append(changed, 'priority'); end if;
  if new.focus_comment is distinct from old.focus_comment then changed := array_append(changed, 'focus_comment'); end if;
  if new.due_at is distinct from old.due_at then changed := array_append(changed, 'due_at'); end if;
  if new.assignee_name is distinct from old.assignee_name then changed := array_append(changed, 'assignee_name'); end if;

  if coalesce(array_length(changed, 1), 0) > 0 then
    insert into public.portal_entity_history (
      entity_type, entity_key, work_date, platform, seller_article, wb_article, ozon_article,
      manager_name, actor_name, actor_role, event_type, changed_fields, note, old_data, new_data
    ) values (
      'task', concat_ws('|', new.work_date::text, new.platform, new.seller_article),
      new.work_date, new.platform, new.seller_article, new.wb_article, new.ozon_article,
      coalesce(new.assignee_name, new.manager_name), actor, 'portal', 'updated', changed,
      coalesce(new.manager_comment, new.leader_comment, new.comment, new.focus_comment),
      to_jsonb(old), to_jsonb(new)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_portal_task_state_history on public.portal_task_state;
create trigger trg_portal_task_state_history
after insert or update on public.portal_task_state
for each row
execute function public.portal_log_task_state_history();

create or replace function public.portal_log_task_comment_history()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.portal_entity_history (
      entity_type, entity_key, work_date, platform, seller_article, wb_article, ozon_article,
      manager_name, actor_name, actor_role, event_type, changed_fields, note, old_data, new_data
    ) values (
      'comment', concat_ws('|', new.work_date::text, new.platform, new.seller_article),
      new.work_date, new.platform, new.seller_article, new.wb_article, new.ozon_article,
      new.manager_name, new.author_name, new.author_role, 'comment_added', array['body'], new.body,
      null, to_jsonb(new)
    );
    return new;
  end if;

  insert into public.portal_entity_history (
    entity_type, entity_key, work_date, platform, seller_article, wb_article, ozon_article,
    manager_name, actor_name, actor_role, event_type, changed_fields, note, old_data, new_data
  ) values (
    'comment', concat_ws('|', new.work_date::text, new.platform, new.seller_article),
    new.work_date, new.platform, new.seller_article, new.wb_article, new.ozon_article,
    new.manager_name, new.author_name, new.author_role, 'comment_updated', array['body'], new.body,
    to_jsonb(old), to_jsonb(new)
  );
  return new;
end;
$$;

drop trigger if exists trg_portal_task_comments_history on public.portal_task_comments;
create trigger trg_portal_task_comments_history
after insert or update on public.portal_task_comments
for each row
execute function public.portal_log_task_comment_history();

create or replace function public.portal_log_supply_history()
returns trigger
language plpgsql
as $$
declare
  changed text[] := '{}';
  actor text;
begin
  actor := coalesce(new.updated_by, 'supply-portal');
  if tg_op = 'INSERT' then
    insert into public.portal_entity_history (
      entity_type, entity_key, work_date, platform, seller_article, wb_article, ozon_article,
      manager_name, actor_name, actor_role, event_type, changed_fields, note, old_data, new_data
    ) values (
      'supply', concat_ws('|', new.snapshot_date::text, new.platform, new.seller_article, new.cluster_name),
      new.snapshot_date, new.platform, new.seller_article, new.wb_article, new.ozon_article,
      null, actor, 'supply', 'created', array['cluster_name'], new.comment, null, to_jsonb(new)
    );
    return new;
  end if;

  if new.in_transit is distinct from old.in_transit then changed := array_append(changed, 'in_transit'); end if;
  if new.production is distinct from old.production then changed := array_append(changed, 'production'); end if;
  if new.procurement is distinct from old.procurement then changed := array_append(changed, 'procurement'); end if;
  if new.target_days is distinct from old.target_days then changed := array_append(changed, 'target_days'); end if;
  if new.eta_date is distinct from old.eta_date then changed := array_append(changed, 'eta_date'); end if;
  if new.comment is distinct from old.comment then changed := array_append(changed, 'comment'); end if;

  if coalesce(array_length(changed, 1), 0) > 0 then
    insert into public.portal_entity_history (
      entity_type, entity_key, work_date, platform, seller_article, wb_article, ozon_article,
      manager_name, actor_name, actor_role, event_type, changed_fields, note, old_data, new_data
    ) values (
      'supply', concat_ws('|', new.snapshot_date::text, new.platform, new.seller_article, new.cluster_name),
      new.snapshot_date, new.platform, new.seller_article, new.wb_article, new.ozon_article,
      null, actor, 'supply', 'updated', changed, new.comment, to_jsonb(old), to_jsonb(new)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_portal_supply_manual_history on public.portal_supply_manual;
create trigger trg_portal_supply_manual_history
after insert or update on public.portal_supply_manual
for each row
execute function public.portal_log_supply_history();

create or replace function public.portal_log_order_history()
returns trigger
language plpgsql
as $$
begin
  insert into public.portal_entity_history (
    entity_type, entity_key, work_date, platform, seller_article, wb_article, ozon_article,
    manager_name, actor_name, actor_role, event_type, changed_fields, note, old_data, new_data
  ) values (
    'order', concat_ws('|', new.request_date::text, new.platform, new.seller_article, new.cluster_name),
    new.request_date, new.platform, new.seller_article, new.wb_article, new.ozon_article,
    null, coalesce(new.created_by, 'portal'), 'supply', 'created', array['requested_qty','recommended_qty'], new.comment,
    null, to_jsonb(new)
  );
  return new;
end;
$$;

drop trigger if exists trg_portal_order_requests_history on public.portal_order_requests;
create trigger trg_portal_order_requests_history
after insert on public.portal_order_requests
for each row
execute function public.portal_log_order_history();

create or replace function public.portal_log_report_history()
returns trigger
language plpgsql
as $$
begin
  insert into public.portal_entity_history (
    entity_type, entity_key, work_date, platform, seller_article, wb_article, ozon_article,
    manager_name, actor_name, actor_role, event_type, changed_fields, note, old_data, new_data
  ) values (
    'report', coalesce(new.id::text, gen_random_uuid()::text),
    new.work_date, new.platform, null, null, null,
    null, coalesce(new.author_name, 'portal'), coalesce(new.author_role, 'portal'), 'created', array['status','items_count'], new.note,
    null, to_jsonb(new)
  );
  return new;
end;
$$;

drop trigger if exists trg_portal_activity_log_history on public.portal_activity_log;
create trigger trg_portal_activity_log_history
after insert on public.portal_activity_log
for each row
execute function public.portal_log_report_history();

create or replace view public.portal_manager_daily_summary as
with comment_rollup as (
  select
    work_date,
    platform,
    seller_article,
    count(*) filter (where not is_deleted) as comments_total,
    max(created_at) filter (where not is_deleted) as last_comment_at
  from public.portal_task_comments
  group by 1,2,3
)
select
  ts.work_date,
  lower(ts.platform) as platform,
  coalesce(ts.assignee_name, ts.manager_name, 'unassigned') as manager_name,
  count(*) as tasks_total,
  count(*) filter (where lower(coalesce(ts.status,'')) in ('done','completed','ready')) as tasks_done,
  count(*) filter (where lower(coalesce(ts.status,'')) in ('in_progress','progress','review')) as tasks_in_progress,
  count(*) filter (where lower(coalesce(ts.status,'')) in ('blocked','problem')) as tasks_blocked,
  sum(coalesce(cr.comments_total, 0)) as comments_total,
  greatest(max(ts.updated_at), max(cr.last_comment_at)) as last_activity_at
from public.portal_task_state ts
left join comment_rollup cr
  on cr.work_date = ts.work_date
 and cr.platform = ts.platform
 and cr.seller_article = ts.seller_article
group by 1,2,3;

create or replace view public.portal_comment_feed as
select
  tc.created_at,
  tc.work_date,
  tc.platform,
  tc.wb_article,
  tc.ozon_article,
  tc.seller_article,
  tc.manager_name,
  tc.author_name,
  tc.author_role,
  tc.comment_type,
  tc.body
from public.portal_task_comments tc
where not tc.is_deleted;

alter table public.portal_activity_log enable row level security;
alter table public.portal_task_state enable row level security;
alter table public.portal_supply_manual enable row level security;
alter table public.portal_order_requests enable row level security;
alter table public.portal_task_comments enable row level security;
alter table public.portal_entity_history enable row level security;

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

do $$ begin
  create policy portal_task_comments_select_all on public.portal_task_comments for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy portal_task_comments_insert_all on public.portal_task_comments for insert with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy portal_task_comments_update_all on public.portal_task_comments for update using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy portal_entity_history_select_all on public.portal_entity_history for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy portal_entity_history_insert_all on public.portal_entity_history for insert with check (true);
exception when duplicate_object then null; end $$;
