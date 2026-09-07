-- AdminSpec.md section 4.9 — responsibilities. Build task 17.

create table responsibilities (
  id                uuid primary key default gen_random_uuid(),
  staff_id          uuid not null references staff on delete cascade,
  title             text not null,       -- 'Library duty'
  position          text,                -- 'secretary'
  schedule_note     text,                -- 'Mondays 10:30'
  academic_year_id  uuid not null references academic_years,
  assigned_by       uuid references staff
);
alter table responsibilities enable row level security;

-- Duty rosters are ordinarily posted/public information within a school —
-- readable by any signed-in staff member (task 17's completion test: "same
-- data reachable from person and from duty" implies both StaffProfile and
-- a duty-roster view read from this one table, so it can't be self-only).
create policy read_responsibilities on responsibilities for select using (current_staff_id() is not null);
create policy write_responsibilities on responsibilities for all
  using (has_permission(current_staff_id(), 'staff.assign_responsibility'))
  with check (has_permission(current_staff_id(), 'staff.assign_responsibility') and assigned_by = current_staff_id());
