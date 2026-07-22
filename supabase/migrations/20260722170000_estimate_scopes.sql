create table if not exists public.estimate_scopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  name text not null default 'New Scope',
  client_display text not null default 'detailed' check(client_display in ('detailed','summary','hidden')),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.estimate_sections
  add column if not exists scope_id uuid references public.estimate_scopes(id) on delete cascade;

alter table public.estimate_scopes enable row level security;
drop policy if exists "Members manage estimate scopes" on public.estimate_scopes;
create policy "Members manage estimate scopes" on public.estimate_scopes for all
  using(public.is_org_member(organization_id))
  with check(public.is_org_member(organization_id));

create index if not exists estimate_scopes_order_idx on public.estimate_scopes(estimate_id, position);
create index if not exists estimate_sections_scope_idx on public.estimate_sections(scope_id, position);

insert into public.estimate_scopes(organization_id, estimate_id, name, client_display, position)
select organization_id, estimate_id, name, client_display, position
from public.estimate_sections section_row
where section_row.scope_id is null
  and not exists (
    select 1 from public.estimate_scopes scope_row
    where scope_row.estimate_id = section_row.estimate_id
      and scope_row.position = section_row.position
      and scope_row.name = section_row.name
  );

update public.estimate_sections section_row
set scope_id = (
  select scope_row.id from public.estimate_scopes scope_row
  where scope_row.estimate_id = section_row.estimate_id
    and scope_row.position = section_row.position
    and scope_row.name = section_row.name
  order by scope_row.created_at
  limit 1
)
where section_row.scope_id is null;

create or replace function public.create_default_estimate_section()
returns trigger language plpgsql security definer set search_path=public as $$
declare new_scope_id uuid;
begin
  insert into public.estimate_scopes(organization_id, estimate_id, name, client_display)
  values(new.organization_id, new.id, 'Roofing', 'detailed') returning id into new_scope_id;
  insert into public.estimate_sections(organization_id, estimate_id, scope_id, name, description, client_display)
  values(new.organization_id, new.id, new_scope_id, 'Roofing System', 'Complete materials and labor for the proposed project.', 'detailed');
  return new;
end $$;
