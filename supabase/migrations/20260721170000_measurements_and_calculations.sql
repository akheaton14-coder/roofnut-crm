create table if not exists public.measurement_fields (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  token text not null,
  unit text not null default 'EA',
  field_group text not null default 'Roof Measurements',
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, token)
);

create table if not exists public.job_measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  measurement_field_id uuid not null references public.measurement_fields(id) on delete cascade,
  value numeric(14,4) not null default 0,
  updated_at timestamptz not null default now(),
  unique (job_id, measurement_field_id)
);

alter table public.products
  add column if not exists quantity_formula text,
  add column if not exists quantity_rounding text not null default 'ceil'
    check (quantity_rounding in ('ceil','round','floor','none'));

alter table public.estimate_items
  add column if not exists quantity_source text not null default 'manual'
    check (quantity_source in ('manual','calculated','override')),
  add column if not exists calculation_formula text,
  add column if not exists calculation_inputs jsonb not null default '{}'::jsonb;

alter table public.measurement_fields enable row level security;
alter table public.job_measurements enable row level security;
create policy "Members manage measurement fields" on public.measurement_fields for all using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create policy "Members manage job measurements" on public.job_measurements for all using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));

do $$ declare org record; begin
  for org in select id from public.organizations loop
    insert into public.measurement_fields (organization_id,name,token,unit,field_group,position) values
      (org.id,'Total Roof Area','TOTAL_ROOF_AREA','SQFT','Roof Measurements',1),
      (org.id,'Waste Percentage','WASTE_PERCENTAGE','PCT','Roof Measurements',2),
      (org.id,'Eaves','EAVES','LF','Roof Measurements',3),
      (org.id,'Rakes','RAKES','LF','Roof Measurements',4),
      (org.id,'Ridges','RIDGES','LF','Roof Measurements',5),
      (org.id,'Hips','HIPS','LF','Roof Measurements',6),
      (org.id,'Valleys','VALLEYS','LF','Roof Measurements',7),
      (org.id,'Step Flashing','STEP_FLASHING','LF','Roof Measurements',8),
      (org.id,'Counter Flashing','COUNTER_FLASHING','LF','Roof Measurements',9),
      (org.id,'Ridge Vent','RIDGE_VENT','LF','Roof Measurements',10),
      (org.id,'Chimneys','CHIMNEYS','EA','Roof Accessories',20),
      (org.id,'OSB Sheets','OSB_SHEETS','EA','Roof Accessories',21),
      (org.id,'Replacing Skylights','REPLACING_SKYLIGHTS','EA','Roof Accessories',22),
      (org.id,'Keeping Skylights','KEEPING_SKYLIGHTS','EA','Roof Accessories',23),
      (org.id,'Pipe Jacks','PIPE_JACKS','EA','Roof Accessories',24),
      (org.id,'Bathroom Vents','BATHROOM_VENTS','EA','Roof Accessories',25),
      (org.id,'Pot Vents','POT_VENTS','EA','Roof Accessories',26),
      (org.id,'Tear-Off Layers','TEAR_OFF_LAYERS','EA','Roof Details',30)
    on conflict (organization_id,token) do nothing;
  end loop;
end $$;
