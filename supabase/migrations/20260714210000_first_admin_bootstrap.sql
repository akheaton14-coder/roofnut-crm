create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  roofnut_org_id uuid;
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;

  -- Only the very first account bootstraps the company and becomes admin.
  -- Later accounts require an explicit invitation before receiving CRM access.
  perform pg_advisory_xact_lock(782664);
  select id into roofnut_org_id from public.organizations order by created_at limit 1;

  if roofnut_org_id is null then
    insert into public.organizations (name)
    values ('Roofnut')
    returning id into roofnut_org_id;

    insert into public.organization_members (organization_id, user_id, role)
    values (roofnut_org_id, new.id, 'admin');
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

grant execute on function public.is_org_member(uuid) to authenticated;
