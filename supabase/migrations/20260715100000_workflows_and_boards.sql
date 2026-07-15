create table public.workflows (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, description text, is_default boolean not null default false, created_at timestamptz not null default now(),
  unique (organization_id, name)
);
create table public.workflow_stages (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null references public.workflows(id) on delete cascade, key text not null, name text not null,
  color text not null default '#526fdf', position integer not null default 0,
  category text not null default 'active' check (category in ('open','active','won','lost','complete')),
  time_limit_days integer, created_at timestamptz not null default now(), unique (workflow_id, key)
);
create table public.job_types (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, workflow_id uuid not null references public.workflows(id) on delete restrict, is_active boolean not null default true,
  created_at timestamptz not null default now(), unique (organization_id, name)
);
create table public.boards (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, description text, workflow_id uuid references public.workflows(id) on delete cascade,
  created_at timestamptz not null default now(), unique (organization_id, name)
);
alter table public.jobs add column job_type_id uuid references public.job_types(id) on delete set null;
alter table public.jobs add column workflow_id uuid references public.workflows(id) on delete set null;
alter table public.jobs add column workflow_stage_id uuid references public.workflow_stages(id) on delete set null;
create index workflow_stages_order_idx on public.workflow_stages (workflow_id, position);
create index jobs_workflow_stage_idx on public.jobs (workflow_stage_id);

alter table public.workflows enable row level security; alter table public.workflow_stages enable row level security;
alter table public.job_types enable row level security; alter table public.boards enable row level security;
create policy "Members manage workflows" on public.workflows for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "Members manage workflow stages" on public.workflow_stages for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "Members manage job types" on public.job_types for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "Members manage boards" on public.boards for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

do $$ declare org record; flow_id uuid; type_id uuid; stage_id uuid; begin
  for org in select id from public.organizations loop
    insert into public.workflows (organization_id,name,description,is_default) values (org.id,'Standard Roofing','Default lead-to-completion workflow',true) returning id into flow_id;
    insert into public.workflow_stages (organization_id,workflow_id,key,name,color,position,category,time_limit_days) values
      (org.id,flow_id,'new_lead','New Lead','#9aa3ad',0,'open',1),(org.id,flow_id,'inspection','Inspection','#7c8cf0',1,'active',3),
      (org.id,flow_id,'estimating','Estimating','#d6a43b',2,'active',3),(org.id,flow_id,'estimate_sent','Estimate Sent','#e98258',3,'active',5),
      (org.id,flow_id,'sold','Sold','#526fdf',4,'won',2),(org.id,flow_id,'pre_production','Pre-Production','#7e6ad6',5,'active',5),
      (org.id,flow_id,'scheduled','Scheduled','#2aa584',6,'active',7),(org.id,flow_id,'in_production','In Production','#16866a',7,'active',3),
      (org.id,flow_id,'completed','Completed','#3e8d65',8,'complete',null),(org.id,flow_id,'lost','Lost','#b35d58',9,'lost',null);
    insert into public.job_types (organization_id,name,workflow_id) values (org.id,'Residential Roofing',flow_id) returning id into type_id;
    insert into public.boards (organization_id,name,description,workflow_id) values (org.id,'Roofing Pipeline','All roofing jobs from lead to completion',flow_id);
    update public.jobs j set workflow_id=flow_id,job_type_id=type_id,workflow_stage_id=(select s.id from public.workflow_stages s where s.workflow_id=flow_id and s.key=j.stage::text limit 1) where j.organization_id=org.id;
  end loop;
end $$;
