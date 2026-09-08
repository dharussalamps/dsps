-- FR-STU-08 (P2): "after a call placed from the app, the user is prompted
-- to record its purpose in one line, retained against the student." The
-- table was named in AdminSpec.md section 4.9 and the export function
-- section 8 (POST /log-call) but never actually built — "Call" buttons
-- throughout the app just open the device dialer with no logging at all.
create table call_logs (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid references students on delete cascade,
  guardian_id   uuid references guardians,
  staff_id      uuid references staff,
  caller_id     uuid not null references staff,
  purpose       text,
  called_at     timestamptz not null default now(),
  check (student_id is not null or staff_id is not null)
);
alter table call_logs enable row level security;

-- Same visibility as the rest of a student's record (student.view_full,
-- scoped through their current class) for a student-related call, or
-- staff.view_directory for a colleague-to-colleague call.
create policy read_call_logs on call_logs for select
  using (
    caller_id = current_staff_id()
    or (student_id is not null and has_permission(current_staff_id(), 'student.view_full', student_current_class_id(student_id)))
    or (staff_id is not null and has_permission(current_staff_id(), 'staff.view_directory'))
  );
create policy write_call_logs on call_logs for insert
  with check (
    caller_id = current_staff_id()
    and (
      (student_id is not null and has_permission(current_staff_id(), 'student.view_full', student_current_class_id(student_id)))
      or (staff_id is not null and has_permission(current_staff_id(), 'staff.view_directory'))
    )
  );
