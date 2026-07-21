create table if not exists public.estimate_sections (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  estimate_id uuid not null references public.estimates(id) on delete cascade, name text not null default 'Project Scope', description text,
  client_display text not null default 'summary' check(client_display in ('detailed','summary','hidden')), position integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.estimate_items add column if not exists section_id uuid references public.estimate_sections(id) on delete set null;
alter table public.estimate_sections enable row level security;
create policy "Members manage estimate sections" on public.estimate_sections for all using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create index if not exists estimate_sections_order_idx on public.estimate_sections(estimate_id,position);

insert into public.estimate_sections(organization_id,estimate_id,name,description,client_display,position)
select organization_id,id,'Roofing System','Complete materials and labor for the proposed project.','summary',0 from public.estimates e
where not exists(select 1 from public.estimate_sections s where s.estimate_id=e.id);
update public.estimate_items i set section_id=(select s.id from public.estimate_sections s where s.estimate_id=i.estimate_id order by position limit 1) where section_id is null;

create or replace function public.create_default_estimate_section() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.estimate_sections(organization_id,estimate_id,name,description,client_display) values(new.organization_id,new.id,'Roofing System','Complete materials and labor for the proposed project.','summary');return new;end $$;
drop trigger if exists create_estimate_default_section on public.estimates;
create trigger create_estimate_default_section after insert on public.estimates for each row execute function public.create_default_estimate_section();

create or replace function public.assign_default_estimate_section() returns trigger language plpgsql security definer set search_path=public as $$ begin if new.section_id is null then select id into new.section_id from public.estimate_sections where estimate_id=new.estimate_id order by position limit 1;end if;return new;end $$;
drop trigger if exists assign_estimate_item_section on public.estimate_items;
create trigger assign_estimate_item_section before insert on public.estimate_items for each row execute function public.assign_default_estimate_section();
