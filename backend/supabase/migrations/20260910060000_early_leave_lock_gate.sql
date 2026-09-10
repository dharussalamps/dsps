-- Early leave could previously be recorded for any date with no lock check
-- at all (write_early_leaves only checked the attendance.early_leave
-- permission). Product wants it to follow the same lock as the attendance
-- it accompanies: today is always recordable regardless of whether today's
-- attendance itself is locked (an early leave is its own event, not an
-- attendance correction), but any other date only while that date's class
-- attendance is currently unlocked (a principal's reopen — same
-- attendance_is_editable this whole date model already runs on, see
-- 20260910050000_attendance_reopen_one_shot.sql).
--
-- Deliberately does *not* consume the reopen the way
-- amend_student_attendance_bulk does — several students' early leaves can
-- be recorded in the same reopened window, and locking the date back after
-- the first one would strand the rest.
drop policy if exists write_early_leaves on early_leaves;
create policy write_early_leaves on early_leaves for insert
  with check (
    has_permission(current_staff_id(), 'attendance.early_leave', student_current_class_id(student_id))
    and recorded_by = current_staff_id()
    and (
      on_date = current_date
      or attendance_is_editable(student_current_class_id(student_id), on_date)
    )
  );
