alter table public.estimates
  add column if not exists profit_margin numeric(7,4) not null default 45;

alter table public.estimate_items
  add column if not exists product_type text not null default 'material' check(product_type in ('material','labor')),
  add column if not exists unit_cost numeric(12,2) not null default 0;

update public.estimate_items item
set product_type = product.product_type,
    unit_cost = round((product.cost * (1 + product.cost_tax_rate / 100))::numeric, 2)
from public.products product
where item.product_id = product.id
  and item.unit_cost = 0;

update public.estimate_items
set unit_cost = round((unit_price * .55)::numeric, 2)
where unit_cost = 0 and unit_price > 0;
