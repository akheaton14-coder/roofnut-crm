alter table public.estimates
  add column if not exists total_override numeric(12,2);

create or replace function public.recalculate_estimate(target_estimate uuid) returns void language plpgsql security definer set search_path=public as $$
declare sub numeric; disc numeric; rate numeric; tax numeric; grand numeric; override_total numeric;
begin
  select coalesce(sum(quantity*unit_price),0) into sub from public.estimate_items where estimate_id=target_estimate;
  select discount_amount,tax_rate,total_override into disc,rate,override_total from public.estimates where id=target_estimate;
  select coalesce(sum(case when taxable then quantity*unit_price else 0 end),0)*rate/100 into tax from public.estimate_items where estimate_id=target_estimate;
  grand:=coalesce(override_total,greatest(0,sub-coalesce(disc,0))+coalesce(tax,0));
  update public.estimates set subtotal=sub,tax_amount=tax,total=grand,updated_at=now() where id=target_estimate;
end $$;
