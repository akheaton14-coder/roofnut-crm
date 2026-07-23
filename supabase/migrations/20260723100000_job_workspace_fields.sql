alter table public.jobs
  add column if not exists project_manager_id uuid references public.profiles(id) on delete set null,
  add column if not exists lead_source text,
  add column if not exists job_type_name text default 'Residential',
  add column if not exists description text,
  add column if not exists insurance_carrier text,
  add column if not exists claim_number text,
  add column if not exists adjuster_name text,
  add column if not exists adjuster_phone text,
  add column if not exists adjuster_email text,
  add column if not exists inspection_date date,
  add column if not exists production_start_date date,
  add column if not exists completion_date date;

create index if not exists jobs_project_manager_idx
  on public.jobs (project_manager_id);
