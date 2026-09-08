-- AdminSpec.md section 4.5 (remainder) — early_leaves and staff_attendance.
-- Build task 12.

create table early_leaves (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students on delete cascade,
  on_date       date not null,
  left_at       time not null,
  reason        text,
  collected_by  text,
  recorded_by   uuid not null references staff,
  created_at    timestamptz not null default now()
);
alter table early_leaves enable row level security;

-- Scoped through the student's current class, same pattern as students/
-- guardians: attendance.early_leave is the permission (section 5.1).
create policy read_early_leaves on early_leaves for select
  using (has_permission(current_staff_id(), 'attendance.early_leave', student_current_class_id(student_id)));
create policy write_early_leaves on early_leaves for insert
  with check (
    has_permission(current_staff_id(), 'attendance.early_leave', student_current_class_id(student_id))
    and recorded_by = current_staff_id()
  );

create type staff_attendance_status as enum ('present', 'late', 'on_leave', 'absent');

create table staff_attendance (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff on delete cascade,
  on_date       date not null,
  checked_in_at timestamptz,
  status        staff_attendance_status not null,
  unique (staff_id, on_date)
);
alter table staff_attendance enable row level security;

-- FR-SAT-03 bug fix: has_permission(viewer, 'attendance.view_board') with
-- no class_id can only ever match a school/self-scoped grant (see its
-- 'grade' branch, which requires a class to resolve a grade_id from) — a
-- grade-scoped sectional head's grant silently never matched here, so the
-- staff board previously fell back to reading zero rows for every
-- colleague and displayed them all as "not checked in" regardless of their
-- real status. can_view_staff_attendance() (below) resolves the
-- grade-scoped case by checking whether the target staff member currently
-- teaches (directly, or via an active cover assignment) a class inside the
-- viewer's granted grade.
create or replace function can_view_staff_attendance(p_viewer uuid, p_target uuid)
returns boolean language sql stable as $$
  select
    p_viewer = p_target
    or exists (
      select 1 from staff_roles sr
      join role_permissions rp on rp.role_id = sr.role_id
      where sr.staff_id = p_viewer
        and sr.revoked_at is null
        and rp.permission_key = 'attendance.view_board'
        and sr.scope_type in ('school', 'self')
    )
    or exists (
      select 1
      from staff_roles viewer_sr
      join role_permissions rp on rp.role_id = viewer_sr.role_id
      where viewer_sr.staff_id = p_viewer
        and viewer_sr.revoked_at is null
        and rp.permission_key = 'attendance.view_board'
        and viewer_sr.scope_type = 'grade'
        and (
          exists (
            select 1 from staff_roles target_sr
            join classes c on c.id = target_sr.scope_id
            where target_sr.staff_id = p_target
              and target_sr.revoked_at is null
              and target_sr.scope_type = 'class'
              and c.grade_id = viewer_sr.scope_id
          )
          or exists (
            select 1 from cover_assignments ca
            join classes c on c.id = ca.class_id
            where ca.staff_id = p_target
              and current_date between ca.starts_on and ca.ends_on
              and c.grade_id = viewer_sr.scope_id
          )
        )
    );
$$;
grant execute on function can_view_staff_attendance(uuid, uuid) to authenticated;

-- section 15 open decision #1: self check-in. Everyone can see the staff
-- board (it's what "switch student/staff tab" on AttendanceBoard shows —
-- section 10), gated the same way as attendance.view_board's class
-- version; a plain staff member can also always see their own row.
create policy read_staff_attendance on staff_attendance for select
  using (can_view_staff_attendance(current_staff_id(), staff_id));
create policy self_check_in on staff_attendance for insert
  with check (staff_id = current_staff_id() and status in ('present', 'late'));
create policy self_check_in_update on staff_attendance for update
  using (staff_id = current_staff_id())
  with check (staff_id = current_staff_id() and status in ('present', 'late'));
-- 'absent'/'on_leave' rows are written by scheduled jobs and the leave
-- approval flow (both privileged, section 7/8) — never by a plain
-- self-check-in insert/update, which is why those two statuses are
-- excluded from the with check above.
