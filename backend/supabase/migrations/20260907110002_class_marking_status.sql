-- AdminSpec.md section 6.4. Written as a set-returning function rather than
-- a plain SQL view, since "v_class_marking_status(on_date)" takes a
-- parameter and Postgres views can't — this is how you get the same
-- effect (call it as `select * from v_class_marking_status('2026-09-07')`).
-- SECURITY INVOKER (the default for functions) means has_permission()
-- below evaluates as the calling user, same as a view with
-- security_invoker = true — one row per class the caller can see via
-- attendance.view_board or attendance.mark, nothing else leaks through.
create or replace function v_class_marking_status(p_on_date date)
returns table (
  class_id      uuid,
  class_name    text,
  grade_number  smallint,
  teacher_id    uuid,
  teacher_name  text,
  submitted     boolean,
  absent_count  integer
)
language sql
stable
as $$
  select
    c.id,
    c.name,
    g.number,
    c.class_teacher_id,
    t.full_name,
    (s.id is not null) as submitted,
    coalesce(
      (select count(*) from student_attendance sa
       where sa.class_id = c.id and sa.on_date = p_on_date and sa.status = 'absent'),
      0
    )::int
  from classes c
  join grades g on g.id = c.grade_id
  left join staff t on t.id = c.class_teacher_id
  left join attendance_submissions s on s.class_id = c.id and s.on_date = p_on_date
  join academic_years ay on ay.id = c.academic_year_id and ay.is_current
  where has_permission(current_staff_id(), 'attendance.view_board', c.id)
     or has_permission(current_staff_id(), 'attendance.mark', c.id)
  order by submitted asc, g.number, c.name;
$$;

grant execute on function v_class_marking_status(date) to authenticated;
