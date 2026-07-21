create table if not exists public.product_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  value text not null,
  label text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, value)
);

alter table public.product_units enable row level security;

create policy "Members manage product units"
on public.product_units for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));
