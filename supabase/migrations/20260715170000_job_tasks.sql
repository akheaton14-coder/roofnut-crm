create table if not exists public.job_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  title text not null,
  category text not null default 'general' check (category in ('general','sales','preproduction','production','closeout')),
  due_date date,
  assigned_to uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists job_tasks_job_order_idx on public.job_tasks (job_id, completed_at, sort_order, created_at);
alter table public.job_tasks enable row level security;
create policy "Members manage job tasks" on public.job_tasks for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
