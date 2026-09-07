-- AdminSpec.md section 4.6 (remainder) — leave_balances, leave_requests.
-- leave_types already exists (build task 2). Build task 13.

create table leave_balances (
  id                uuid primary key default gen_random_uuid(),
  staff_id          uuid not null references staff on delete cascade,
  leave_type_id     uuid not null references leave_types,
  academic_year_id  uuid not null references academic_years,
  entitled          numeric(4,1) not null,
  used              numeric(4,1) not null default 0,
  unique (staff_id, leave_type_id, academic_year_id)
);
alter table leave_balances enable row level security;

create type leave_status as enum ('pending', 'approved', 'rejected', 'withdrawn');

create table leave_requests (
  id             uuid primary key default gen_random_uuid(),
  staff_id       uuid not null references staff on delete cascade,
  leave_type_id  uuid not null references leave_types,
  starts_on      date not null,
  ends_on        date not null,
  half_day       boolean not null default false,
  day_count      numeric(4,1) not null,
  reason         text not null,
  document_path  text,
  status         leave_status not null default 'pending',
  decided_by     uuid references staff,
  decided_at     timestamptz,
  remarks        text,
  cover_assignment_id uuid references cover_assignments,
  -- section 11: "approval ... cannot be approved until a cover teacher is
  -- chosen or the principal explicitly acknowledges none is needed" — not
  -- a column in section 4.6's table, but there is nowhere else to record
  -- that acknowledgement short of adding one. See docs/AdminSpec.md
  -- section 17.
  cover_not_needed    boolean not null default false,
  created_at     timestamptz not null default now(),
  check (ends_on >= starts_on)
);
alter table leave_requests enable row level security;

-- section 15 open decision #3: "Sectional head sight of leave balances:
-- Granted for own section (leave.view_balances at grade scope)." But
-- has_permission()'s grade branch needs a class_id to resolve against —
-- leave_balances/leave_requests have no class_id, only a staff_id, and
-- staff aren't attached to a grade as a first-class attribute. This
-- resolves "own section" as "the target staff member is the class
-- teacher of a class in my granted grade" — the closest a staff member
-- comes to belonging to a grade in this data model.
create or replace function can_view_staff_leave(p_target_staff_id uuid)
returns boolean
language sql
stable
as $$
  select
    p_target_staff_id = current_staff_id()
    or has_permission(current_staff_id(), 'leave.approve')
    or has_permission(current_staff_id(), 'leave.view_balances')
    or exists (
      select 1
      from staff_roles sr
      join roles r on r.id = sr.role_id and r.key = 'sectional_head'
      join classes c on c.grade_id = sr.scope_id and c.class_teacher_id = p_target_staff_id
      where sr.staff_id = current_staff_id()
        and sr.scope_type = 'grade'
        and sr.revoked_at is null
    );
$$;
grant execute on function can_view_staff_leave(uuid) to authenticated;

create policy read_leave_balances on leave_balances for select
  using (can_view_staff_leave(staff_id));
-- No client write policy: balances are seeded per academic year and
-- decremented only by approve_leave() (SECURITY DEFINER, below).

create policy read_leave_requests on leave_requests for select
  using (can_view_staff_leave(staff_id));
create policy request_leave on leave_requests for insert
  with check (staff_id = current_staff_id() and status = 'pending');
create policy withdraw_leave on leave_requests for update
  using (staff_id = current_staff_id() and status = 'pending')
  with check (staff_id = current_staff_id() and status = 'withdrawn');
-- Approving/rejecting is not a plain client update (section 11: approval
-- must atomically touch balances + cover + notifications) — see
-- approve_leave()/reject_leave() below.
