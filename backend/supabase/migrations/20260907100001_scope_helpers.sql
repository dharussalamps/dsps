-- Helper for RLS policies below. A student doesn't carry a class_id
-- directly (AdminSpec.md section 4.3: "a student's class is always read
-- through the enrolment for the current year"), so every policy that needs
-- to scope a student by class resolves it through this function. Returns
-- null if the student has no enrolment in the current academic year —
-- has_permission() still returns true for 'school'/'self'-scoped grants
-- with a null class_id, so school-wide roles are unaffected; only
-- grade/class-scoped roles lose visibility of an unenrolled student, which
-- is the correct behaviour (they have no class to be scoped by).
create or replace function student_current_class_id(p_student_id uuid)
returns uuid
language sql
stable
as $$
  select se.class_id
  from student_enrolments se
  where se.student_id = p_student_id
    and se.academic_year_id = (select id from academic_years where is_current)
  limit 1;
$$;

grant execute on function student_current_class_id(uuid) to authenticated;
