alter table public.workflow_stages
  add column if not exists phase text not null default 'leads'
  check (phase in ('leads','estimating','preproduction','production','closed'));

update public.workflow_stages set phase = case
  when key in ('new_lead','inspection') then 'leads'
  when key in ('estimating','estimate_sent') then 'estimating'
  when key in ('sold','pre_production','scheduled') then 'preproduction'
  when key in ('in_production','completed') then 'production'
  when key in ('lost','cancelled') then 'closed'
  else phase
end;
