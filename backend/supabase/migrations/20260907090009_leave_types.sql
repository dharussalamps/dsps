-- AdminSpec.md section 4.6 — leave_types only, pulled forward because build
-- task 2's completion test requires seeding it. leave_balances and
-- leave_requests are built with the rest of the leave module (build task 13).

create table leave_types (
  id                  uuid primary key default gen_random_uuid(),
  key                 text not null unique,     -- 'casual','medical','duty','half_day'
  name                text not null,
  annual_entitlement  numeric(4,1) not null,
  requires_document   boolean not null default false
);
alter table leave_types enable row level security;
