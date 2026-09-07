-- AdminSpec.md section 4.5 (attendance_submissions, student_attendance only
-- — early_leaves and staff_attendance arrive with build task 12, matching
-- when their screens are built) and section 6.2/6.3's derived functions.

create type attendance_status as enum ('present', 'absent', 'late');

create table attendance_submissions (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid not null references classes,
  on_date        date not null,
  submitted_by   uuid not null references staff,
  submitted_at   timestamptz not null default now(),
  locked_at      timestamptz,
  device_id      text,
  unique (class_id, on_date)
);
alter table attendance_submissions enable row level security;

create table student_attendance (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references students on delete cascade,
  class_id       uuid not null references classes,
  on_date        date not null,
  status         attendance_status not null,
  reason         text,
  marked_by      uuid not null references staff,
  marked_at      timestamptz not null default now(),
  unique (student_id, on_date)
);
alter table student_attendance enable row level security;
create index student_attendance_class_date on student_attendance (class_id, on_date);
create index student_attendance_student_date on student_attendance (student_id, on_date desc);

-- section 6.2 — attendance editability
create or replace function attendance_is_editable(p_class uuid, p_date date)
returns boolean language sql stable as $$
  select coalesce(
    (select now() < s.submitted_at
       + make_interval(mins => (select attendance_edit_minutes from school_settings))
     from attendance_submissions s
     where s.class_id = p_class and s.on_date = p_date),
    true)  -- not yet submitted, therefore editable
$$;
grant execute on function attendance_is_editable(uuid, date) to authenticated;

-- section 6.3 — consecutive absences as of a given date (inclusive)
create or replace function consecutive_absences(p_student uuid, p_as_of date)
returns integer language sql stable as $$
  with days as (
    select on_date, status
    from student_attendance
    where student_id = p_student and on_date <= p_as_of
    order by on_date desc
    limit 30
  ), run as (
    select status, row_number() over (order by on_date desc) rn
    from days
  )
  select coalesce(min(rn) - 1, (select count(*) from run))::int
  from run where status <> 'absent';
$$;
grant execute on function consecutive_absences(uuid, date) to authenticated;

-- RLS: same has_permission pattern as every other table. attendance.mark
-- covers the marking teacher (and, via has_permission's cover-assignment
-- branch, an active cover teacher); attendance.view_board covers read-only
-- viewers (sectional heads, principal).
create policy read_attendance_submissions on attendance_submissions for select
  using (
    has_permission(current_staff_id(), 'attendance.view_board', class_id)
    or has_permission(current_staff_id(), 'attendance.mark', class_id)
  );
create policy write_attendance_submissions on attendance_submissions for insert
  with check (has_permission(current_staff_id(), 'attendance.mark', class_id) and submitted_by = current_staff_id());
-- No client update/delete policy: a submission's own edit window is
-- enforced through student_attendance (below); attendance_submissions
-- itself is written once per (class, on_date) by the submit-attendance
-- Edge Function and never edited directly.

create policy read_student_attendance on student_attendance for select
  using (
    has_permission(current_staff_id(), 'attendance.view_board', class_id)
    or has_permission(current_staff_id(), 'attendance.mark', class_id)
  );
create policy write_student_attendance on student_attendance for insert
  with check (
    has_permission(current_staff_id(), 'attendance.mark', class_id)
    and is_school_day(on_date)
    and attendance_is_editable(class_id, on_date)
    and marked_by = current_staff_id()
  );
create policy amend_student_attendance on student_attendance for update
  using (
    has_permission(current_staff_id(), 'attendance.mark', class_id)
    or has_permission(current_staff_id(), 'attendance.amend_locked', class_id)
  )
  with check (
    (
      has_permission(current_staff_id(), 'attendance.mark', class_id)
      and attendance_is_editable(class_id, on_date)
    )
    or (
      -- after the edit window, only amend_locked can write, and only with
      -- a reason (section 6.2: "writes require ... a non-null reason") —
      -- audit_log row for this is written by the submit-attendance /
      -- amend-attendance Edge Function, not by this policy.
      has_permission(current_staff_id(), 'attendance.amend_locked', class_id)
      and reason is not null
    )
  );
