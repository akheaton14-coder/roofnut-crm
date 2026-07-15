create table if not exists public.products (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, description text, category text not null default 'Roofing', unit text not null default 'each',
  unit_price numeric(12,2) not null default 0, taxable boolean not null default true, active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.estimates (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade, estimate_number bigint generated always as identity,
  title text not null default 'Roofing Proposal', status text not null default 'draft' check(status in ('draft','sent','approved','declined')),
  notes text, discount_amount numeric(12,2) not null default 0, tax_rate numeric(7,4) not null default 0,
  subtotal numeric(12,2) not null default 0, tax_amount numeric(12,2) not null default 0, total numeric(12,2) not null default 0,
  created_by uuid references public.profiles(id) on delete set null, approved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.estimate_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  estimate_id uuid not null references public.estimates(id) on delete cascade, product_id uuid references public.products(id) on delete set null,
  name text not null, description text, quantity numeric(12,3) not null default 1, unit text not null default 'each', unit_price numeric(12,2) not null default 0,
  taxable boolean not null default true, position integer not null default 0, created_at timestamptz not null default now()
);
create index if not exists estimates_job_idx on public.estimates(job_id,created_at desc);
create index if not exists estimate_items_order_idx on public.estimate_items(estimate_id,position);
alter table public.products enable row level security; alter table public.estimates enable row level security; alter table public.estimate_items enable row level security;
create policy "Members manage products" on public.products for all using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create policy "Members manage estimates" on public.estimates for all using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create policy "Members manage estimate items" on public.estimate_items for all using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));

create or replace function public.recalculate_estimate(target_estimate uuid) returns void language plpgsql security definer set search_path=public as $$
declare sub numeric; disc numeric; rate numeric; tax numeric; grand numeric;
begin
  select coalesce(sum(quantity*unit_price),0) into sub from public.estimate_items where estimate_id=target_estimate;
  select discount_amount,tax_rate into disc,rate from public.estimates where id=target_estimate;
  select coalesce(sum(case when taxable then quantity*unit_price else 0 end),0)*rate/100 into tax from public.estimate_items where estimate_id=target_estimate;
  grand:=greatest(0,sub-coalesce(disc,0))+coalesce(tax,0);
  update public.estimates set subtotal=sub,tax_amount=tax,total=grand,updated_at=now() where id=target_estimate;
end $$;
create or replace function public.estimate_item_recalculate_trigger() returns trigger language plpgsql security definer set search_path=public as $$ begin perform public.recalculate_estimate(coalesce(new.estimate_id,old.estimate_id));return coalesce(new,old);end $$;
drop trigger if exists recalculate_estimate_items on public.estimate_items;
create trigger recalculate_estimate_items after insert or update or delete on public.estimate_items for each row execute function public.estimate_item_recalculate_trigger();
create or replace function public.approved_estimate_updates_job() returns trigger language plpgsql security definer set search_path=public as $$ begin if new.status='approved' and old.status is distinct from 'approved' then new.approved_at=now();update public.jobs set contract_value=new.total,updated_at=now() where id=new.job_id;end if;return new;end $$;
drop trigger if exists approved_estimate_job_value on public.estimates;
create trigger approved_estimate_job_value before update on public.estimates for each row execute function public.approved_estimate_updates_job();
