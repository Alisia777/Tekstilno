create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.portal_tasks (
  id text primary key,
  brand text not null default 'Алтея',
  article_key text not null,
  title text not null,
  next_action text,
  reason text,
  owner text,
  due date,
  status text not null default 'new',
  type text not null default 'general',
  priority text not null default 'medium',
  platform text not null default 'all',
  source text not null default 'manual',
  entity_label text,
  auto_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_comments (
  id text primary key,
  brand text not null default 'Алтея',
  article_key text not null,
  author text not null,
  team text,
  text text not null,
  type text not null default 'signal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_decisions (
  id text primary key,
  brand text not null default 'Алтея',
  article_key text not null,
  title text not null,
  decision text not null,
  owner text,
  status text not null default 'waiting_decision',
  due date,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_owner_assignments (
  brand text not null default 'Алтея',
  article_key text not null,
  owner_name text,
  owner_role text,
  note text,
  assigned_by text,
  updated_at timestamptz not null default now(),
  primary key (brand, article_key)
);

create index if not exists idx_portal_tasks_brand_article on public.portal_tasks (brand, article_key);
create index if not exists idx_portal_tasks_brand_status on public.portal_tasks (brand, status);
create index if not exists idx_portal_comments_brand_article on public.portal_comments (brand, article_key);
create index if not exists idx_portal_decisions_brand_article on public.portal_decisions (brand, article_key);
create index if not exists idx_portal_owner_assignments_brand_article on public.portal_owner_assignments (brand, article_key);

drop trigger if exists trg_portal_tasks_updated_at on public.portal_tasks;
create trigger trg_portal_tasks_updated_at
before update on public.portal_tasks
for each row execute function public.set_updated_at();

drop trigger if exists trg_portal_comments_updated_at on public.portal_comments;
create trigger trg_portal_comments_updated_at
before update on public.portal_comments
for each row execute function public.set_updated_at();

drop trigger if exists trg_portal_decisions_updated_at on public.portal_decisions;
create trigger trg_portal_decisions_updated_at
before update on public.portal_decisions
for each row execute function public.set_updated_at();

alter table public.portal_tasks enable row level security;
alter table public.portal_comments enable row level security;
alter table public.portal_decisions enable row level security;
alter table public.portal_owner_assignments enable row level security;

drop policy if exists "portal_tasks_select_authenticated" on public.portal_tasks;
create policy "portal_tasks_select_authenticated"
on public.portal_tasks
for select
to authenticated
using (true);

drop policy if exists "portal_tasks_insert_authenticated" on public.portal_tasks;
create policy "portal_tasks_insert_authenticated"
on public.portal_tasks
for insert
to authenticated
with check (true);

drop policy if exists "portal_tasks_update_authenticated" on public.portal_tasks;
create policy "portal_tasks_update_authenticated"
on public.portal_tasks
for update
to authenticated
using (true)
with check (true);

drop policy if exists "portal_tasks_delete_authenticated" on public.portal_tasks;
create policy "portal_tasks_delete_authenticated"
on public.portal_tasks
for delete
to authenticated
using (true);

drop policy if exists "portal_comments_select_authenticated" on public.portal_comments;
create policy "portal_comments_select_authenticated"
on public.portal_comments
for select
to authenticated
using (true);

drop policy if exists "portal_comments_insert_authenticated" on public.portal_comments;
create policy "portal_comments_insert_authenticated"
on public.portal_comments
for insert
to authenticated
with check (true);

drop policy if exists "portal_comments_update_authenticated" on public.portal_comments;
create policy "portal_comments_update_authenticated"
on public.portal_comments
for update
to authenticated
using (true)
with check (true);

drop policy if exists "portal_comments_delete_authenticated" on public.portal_comments;
create policy "portal_comments_delete_authenticated"
on public.portal_comments
for delete
to authenticated
using (true);

drop policy if exists "portal_decisions_select_authenticated" on public.portal_decisions;
create policy "portal_decisions_select_authenticated"
on public.portal_decisions
for select
to authenticated
using (true);

drop policy if exists "portal_decisions_insert_authenticated" on public.portal_decisions;
create policy "portal_decisions_insert_authenticated"
on public.portal_decisions
for insert
to authenticated
with check (true);

drop policy if exists "portal_decisions_update_authenticated" on public.portal_decisions;
create policy "portal_decisions_update_authenticated"
on public.portal_decisions
for update
to authenticated
using (true)
with check (true);

drop policy if exists "portal_decisions_delete_authenticated" on public.portal_decisions;
create policy "portal_decisions_delete_authenticated"
on public.portal_decisions
for delete
to authenticated
using (true);

drop policy if exists "portal_owner_assignments_select_authenticated" on public.portal_owner_assignments;
create policy "portal_owner_assignments_select_authenticated"
on public.portal_owner_assignments
for select
to authenticated
using (true);

drop policy if exists "portal_owner_assignments_insert_authenticated" on public.portal_owner_assignments;
create policy "portal_owner_assignments_insert_authenticated"
on public.portal_owner_assignments
for insert
to authenticated
with check (true);

drop policy if exists "portal_owner_assignments_update_authenticated" on public.portal_owner_assignments;
create policy "portal_owner_assignments_update_authenticated"
on public.portal_owner_assignments
for update
to authenticated
using (true)
with check (true);

drop policy if exists "portal_owner_assignments_delete_authenticated" on public.portal_owner_assignments;
create policy "portal_owner_assignments_delete_authenticated"
on public.portal_owner_assignments
for delete
to authenticated
using (true);
