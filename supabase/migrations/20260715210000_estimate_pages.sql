create table if not exists public.estimate_pages (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  estimate_id uuid not null references public.estimates(id) on delete cascade, page_type text not null default 'custom',
  title text not null, enabled boolean not null default true, position integer not null default 0,
  content jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists estimate_pages_order_idx on public.estimate_pages(estimate_id,position);
alter table public.estimate_pages enable row level security;
create policy "Members manage estimate pages" on public.estimate_pages for all using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create or replace function public.create_default_estimate_pages() returns trigger language plpgsql security definer set search_path=public as $$ begin
  insert into public.estimate_pages(organization_id,estimate_id,page_type,title,position,content) values
    (new.organization_id,new.id,'cover','Cover Page',0,jsonb_build_object('headline',new.title,'subheadline','A better roof. A better experience.')),
    (new.organization_id,new.id,'text','Introduction',1,jsonb_build_object('body','Thank you for giving Roofnut the opportunity to quote your home. This proposal outlines the recommended roofing system, project scope, and available options.')),
    (new.organization_id,new.id,'inspection','Inspection',2,jsonb_build_object('body','Inspection findings and property photos will appear here.')),
    (new.organization_id,new.id,'quote','Quote Details',3,'{}'::jsonb),
    (new.organization_id,new.id,'upgrades','Signing & Upgrades',4,jsonb_build_object('body','Select any optional upgrades before approving your proposal.')),
    (new.organization_id,new.id,'terms','Terms & Conditions',5,jsonb_build_object('body','Estimate valid for 30 days. Final scheduling begins after approval and required deposit.'));
  return new;
end $$;
drop trigger if exists default_estimate_pages on public.estimates;
create trigger default_estimate_pages after insert on public.estimates for each row execute function public.create_default_estimate_pages();
insert into public.estimate_pages(organization_id,estimate_id,page_type,title,position,content)
select e.organization_id,e.id,v.page_type,v.title,v.position,v.content from public.estimates e cross join (values
  ('cover','Cover Page',0,'{"headline":"Roofing Proposal","subheadline":"A better roof. A better experience."}'::jsonb),
  ('text','Introduction',1,'{"body":"Thank you for giving Roofnut the opportunity to quote your home."}'::jsonb),
  ('inspection','Inspection',2,'{"body":"Inspection findings and property photos will appear here."}'::jsonb),
  ('quote','Quote Details',3,'{}'::jsonb),('upgrades','Signing & Upgrades',4,'{"body":"Select any optional upgrades before approving your proposal."}'::jsonb),
  ('terms','Terms & Conditions',5,'{"body":"Estimate valid for 30 days. Final scheduling begins after approval and required deposit."}'::jsonb)
) as v(page_type,title,position,content) where not exists(select 1 from public.estimate_pages p where p.estimate_id=e.id);
