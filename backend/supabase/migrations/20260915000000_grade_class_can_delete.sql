-- Academic Structure screen: the Delete icon on a grade/class should only
-- appear when nothing else in the schema still points at it (deleteGrade/
-- deleteClass in apps/admin/src/features/academicStructure/api.ts already
-- rely on the underlying FK constraints to refuse the delete outright, same
-- as delete_student's explicit checks in 20260912130000 — these two
-- functions expose that same "still linked?" question as a cheap read so
-- the UI can decide whether to show the button at all, instead of only
-- finding out after the user taps it.
--
-- grades is referenced by exactly two tables (classes.grade_id,
-- grade_subjects.grade_id — confirmed against every migration under this
-- folder); classes is referenced by six (student_enrolments, cover_
-- assignments, attendance_submissions, student_attendance, student_
-- attendance_reopens, mark_sheets — class_subject_teachers is deliberately
-- excluded since it cascade-deletes with the class rather than blocking
-- it). If a future migration adds another FK to either table, it needs a
-- matching line here or this check will under-report — the actual delete
-- stays safe regardless since it still goes through the real FK constraint.

create or replace function grade_can_delete(p_grade_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from classes where grade_id = p_grade_id)
     and not exists (select 1 from grade_subjects where grade_id = p_grade_id);
$$;
grant execute on function grade_can_delete(uuid) to authenticated;

create or replace function class_can_delete(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from student_enrolments where class_id = p_class_id)
     and not exists (select 1 from cover_assignments where class_id = p_class_id)
     and not exists (select 1 from attendance_submissions where class_id = p_class_id)
     and not exists (select 1 from student_attendance where class_id = p_class_id)
     and not exists (select 1 from student_attendance_reopens where class_id = p_class_id)
     and not exists (select 1 from mark_sheets where class_id = p_class_id);
$$;
grant execute on function class_can_delete(uuid) to authenticated;
