-- Set class screen: the delete icon added in delete_student() (20260912130000_
-- delete_unassigned_student.sql) must not even be offered for a student who
-- has attendance recorded — not just refuse the tap after the fact — so
-- list_unassigned_students() now reports whether each student has any
-- student_attendance rows, letting the client hide the icon outright.
-- (Every row here is already guaranteed to have no *current* class, so
-- has_attendance is the only extra signal the client needs.)

drop function if exists list_unassigned_students();

create or replace function list_unassigned_students()
returns table (id uuid, admission_no text, full_name text, preferred_name text, photo_path text, status person_status, has_attendance boolean)
language sql
stable
as $$
  select s.id, s.admission_no, s.full_name, s.preferred_name, s.photo_path, s.status,
    exists (select 1 from student_attendance sa where sa.student_id = s.id) as has_attendance
  from students s
  where s.status <> 'left'
    and not exists (
      select 1 from student_enrolments se
      where se.student_id = s.id
        and se.academic_year_id = (select id from academic_years where is_current)
    )
  order by s.full_name;
$$;
grant execute on function list_unassigned_students() to authenticated;
