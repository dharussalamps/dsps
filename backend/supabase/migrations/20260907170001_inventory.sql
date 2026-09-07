-- AdminSpec.md section 4.9 — inventory. Build task 18.

create table inventory_items (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      text not null,
  location      text,
  condition     text,
  min_quantity  integer not null default 0,
  code          text unique,
  status        text not null default 'active'
);
alter table inventory_items enable row level security;

create type inv_txn_type as enum ('receipt', 'issue', 'return', 'write_off', 'adjustment');

create table inventory_transactions (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references inventory_items on delete cascade,
  txn_type      inv_txn_type not null,
  quantity      integer not null,      -- signed: receipts positive, issues negative
  note          text,
  actor_id      uuid not null references staff,
  created_at    timestamptz not null default now()
);
alter table inventory_transactions enable row level security;
-- "Current quantity is always sum(quantity). Never store it as a column."

create policy read_inventory_items on inventory_items for select
  using (has_permission(current_staff_id(), 'inventory.view') or has_permission(current_staff_id(), 'inventory.manage'));
create policy write_inventory_items on inventory_items for all
  using (has_permission(current_staff_id(), 'inventory.manage'))
  with check (has_permission(current_staff_id(), 'inventory.manage'));

create policy read_inventory_transactions on inventory_transactions for select
  using (has_permission(current_staff_id(), 'inventory.view') or has_permission(current_staff_id(), 'inventory.manage'));
create policy write_inventory_transactions on inventory_transactions for insert
  with check (has_permission(current_staff_id(), 'inventory.manage') and actor_id = current_staff_id());
-- Transactions are an append-only ledger — no update/delete policy;
-- correcting a mistake is a new 'adjustment' row, same as real stock books.

create or replace function inventory_quantity(p_item_id uuid)
returns integer
language sql
stable
as $$
  select coalesce(sum(quantity), 0)::int from inventory_transactions where item_id = p_item_id;
$$;
grant execute on function inventory_quantity(uuid) to authenticated;

-- section 7: low_stock_check, daily 07:00. No is_school_day gate in
-- section 7's table for this one specifically, but section 7's intro says
-- "every one" — applied literally again (stock levels don't meaningfully
-- change on a non-school day since no one is issuing/receiving items).
create or replace function job_low_stock_check() returns void
language plpgsql as $$
declare
  r record;
  v_recipient uuid;
begin
  if not is_school_day(current_date) then return; end if;

  for r in
    select i.id, i.name, inventory_quantity(i.id) as qty
    from inventory_items i
    where i.status = 'active' and inventory_quantity(i.id) <= i.min_quantity
  loop
    for v_recipient in
      select sr.staff_id from staff_roles sr
      join roles ro on ro.id = sr.role_id
      where ro.key in ('administrator', 'principal') and sr.revoked_at is null
    loop
      insert into notifications (staff_id, type, title, body, payload)
      values (v_recipient, 'inventory.low_stock', 'Low stock', format('%s is at %s (min %s).', r.name, r.qty, (select min_quantity from inventory_items where id = r.id)),
              jsonb_build_object('item_id', r.id));
    end loop;
  end loop;
end;
$$;
select cron.schedule('low_stock_check', '0 7 * * *', 'select job_low_stock_check()');
