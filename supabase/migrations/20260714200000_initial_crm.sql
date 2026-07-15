create extension if not exists pgcrypto;

create type public.team_role as enum ('admin', 'sales', 'production', 'office', 'viewer');
create type public.job_stage as enum ('new_lead', 'inspection', 'estimating', 'estimate_sent', 'sold', 'pre_production', 'scheduled', 'in_production', 'completed', 'lost');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.team_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_id text,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  company text,
  tags text[] not null default '{}',
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_id)
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  address_1 text not null,
  address_2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  created_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  title text not null,
  stage public.job_stage not null default 'new_lead',
  contract_value numeric(12,2) not null default 0,
  owner_id uuid references public.profiles(id) on delete set null,
  next_action text,
  next_action_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null,
  body text not null default '',
  occurred_at timestamptz not null default now()
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  storage_path text not null unique,
  filename text not null,
  content_type text,
  size_bytes bigint not null default 0,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index clients_org_name_idx on public.clients (organization_id, last_name, first_name);
create index jobs_org_stage_idx on public.jobs (organization_id, stage);
create index activities_job_time_idx on public.activities (job_id, occurred_at desc);

create or replace function public.is_org_member(org_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.organization_members where organization_id = org_id and user_id = auth.uid()) $$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.clients enable row level security;
alter table public.properties enable row level security;
alter table public.jobs enable row level security;
alter table public.activities enable row level security;
alter table public.files enable row level security;

create policy "Users can read their profile" on public.profiles for select using (id = auth.uid());
create policy "Members can read organizations" on public.organizations for select using (public.is_org_member(id));
create policy "Members can read memberships" on public.organization_members for select using (public.is_org_member(organization_id));
create policy "Members can manage clients" on public.clients for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "Members can manage properties" on public.properties for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "Members can manage jobs" on public.jobs for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "Members can manage activities" on public.activities for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "Members can manage files" on public.files for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

insert into storage.buckets (id, name, public)
values ('job-files', 'job-files', false)
on conflict (id) do nothing;

create policy "Members can read job files" on storage.objects for select
using (bucket_id = 'job-files' and public.is_org_member((storage.foldername(name))[1]::uuid));
create policy "Members can upload job files" on storage.objects for insert
with check (bucket_id = 'job-files' and public.is_org_member((storage.foldername(name))[1]::uuid));
create policy "Members can update job files" on storage.objects for update
using (bucket_id = 'job-files' and public.is_org_member((storage.foldername(name))[1]::uuid));
create policy "Members can delete job files" on storage.objects for delete
using (bucket_id = 'job-files' and public.is_org_member((storage.foldername(name))[1]::uuid));
