alter table public.products
  add column if not exists product_type text not null default 'material' check (product_type in ('material','labor')),
  add column if not exists cost numeric(12,2) not null default 0,
  add column if not exists cost_tax_rate numeric(7,4) not null default 7.5,
  add column if not exists profit_margin numeric(7,4) not null default 0;

-- Preserve the selling price of catalog items created before detailed costing.
update public.products
set cost = unit_price,
    cost_tax_rate = 0,
    profit_margin = 0
where cost = 0 and unit_price <> 0;
