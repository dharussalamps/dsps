-- Not part of AdminSpec.md (added post-spec, per product request) — each
-- staff member's own Home screen widget on/off choices, backing the new
-- "Dashboard widgets" settings screen.
--
-- Stores only *overrides* against the client's widget registry defaults
-- (apps/admin/src/features/home/widgets.ts), so shipping a new widget later
-- never needs a data migration: a widget id with no entry here just falls
-- back to that widget's registry default. Same "client owns exactly one
-- row, RLS scopes it to staff_id = current_staff_id()" shape as `devices`
-- (20260907110003_devices_notifications.sql) — no grant statements needed
-- beyond RLS, matching that table.

create table staff_dashboard_prefs (
  staff_id          uuid primary key references staff on delete cascade,
  widget_overrides  jsonb not null default '{}'::jsonb,  -- {"widgetId": true|false}
  updated_at        timestamptz not null default now()
);
alter table staff_dashboard_prefs enable row level security;

create trigger staff_dashboard_prefs_set_updated_at
  before update on staff_dashboard_prefs
  for each row execute function set_updated_at();

create policy own_dashboard_prefs on staff_dashboard_prefs for all
  using (staff_id = current_staff_id())
  with check (staff_id = current_staff_id());
