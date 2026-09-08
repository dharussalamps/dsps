-- Follow-up to build task 14/20 (see docs/AdminSpec.md section 17): three
-- P2 marks requirements that were built as data-model-ready but never
-- actually surfaced. All three are read-only, SECURITY INVOKER (default) —
-- they only ever return what the caller's own read_marks/read_mark_sheets
-- RLS already lets them see, same as class_subject_average() above them.

-- FR-MRK-06: "a student's term average and position within the class are
-- shown."
create or replace function student_class_position(p_student_id uuid, p_term_id uuid)
returns table(avg_score numeric, class_position integer, class_size integer)
language sql
stable
as $$
  with target_class as (
    select se.class_id
    from student_enrolments se
    join academic_years ay on ay.id = se.academic_year_id and ay.is_current
    where se.student_id = p_student_id
    limit 1
  ),
  classmates as (
    select se.student_id
    from student_enrolments se
    join academic_years ay on ay.id = se.academic_year_id and ay.is_current
    join target_class tc on tc.class_id = se.class_id
    join students s on s.id = se.student_id and s.status <> 'left'
  ),
  term_marks as (
    select m.student_id, m.score
    from marks m
    join mark_sheets ms on ms.id = m.mark_sheet_id and ms.term_id = p_term_id
  ),
  term_averages as (
    select cm.student_id, avg(tm.score) as avg_score
    from classmates cm
    left join term_marks tm on tm.student_id = cm.student_id
    group by cm.student_id
  ),
  ranked as (
    select student_id, avg_score,
           rank() over (order by avg_score desc nulls last) as position,
           count(*) over () as class_size
    from term_averages
  )
  select round(avg_score, 2), position::int, class_size::int
  from ranked
  where student_id = p_student_id;
$$;
grant execute on function student_class_position(uuid, uuid) to authenticated;

-- FR-MRK-07: "a student's average is presented across terms so that a
-- trend is visible." Only terms the student has at least one entered mark
-- in are returned — an empty future term shouldn't render as a zero.
create or replace function student_term_trend(p_student_id uuid)
returns table(term_id uuid, term_name text, sequence smallint, avg_score numeric)
language sql
stable
as $$
  select t.id, t.name, t.sequence, round(avg(m.score), 2)
  from terms t
  left join mark_sheets ms on ms.term_id = t.id
  left join marks m on m.mark_sheet_id = ms.id and m.student_id = p_student_id
  where t.academic_year_id = (select id from academic_years where is_current)
  group by t.id, t.name, t.sequence
  having count(m.score) > 0
  order by t.sequence;
$$;
grant execute on function student_term_trend(uuid) to authenticated;

-- FR-MRK-08: "... including which mark sheets are outstanding." Mark
-- sheets are created lazily on first entry (getOrCreateMarkSheet, client
-- side) — a class/subject/term combination nobody has started yet has no
-- row at all, so a plain "list mark_sheets" query can never show it as
-- outstanding. This instead starts from every class-subject-teacher
-- assignment that should produce a sheet each term and left-joins to see
-- which ones haven't been submitted.
create or replace function outstanding_mark_sheets(p_term_id uuid default null)
returns table(
  class_id uuid, class_name text,
  subject_id uuid, subject_name text,
  term_id uuid, term_name text,
  teacher_name text,
  status text
)
language sql
stable
as $$
  select c.id, c.name, s.id, s.name, t.id, t.name, st.full_name,
         coalesce(ms.status::text, 'not_started')
  from class_subject_teachers cst
  join classes c on c.id = cst.class_id
  join subjects s on s.id = cst.subject_id
  join staff st on st.id = cst.staff_id
  join terms t on t.academic_year_id = c.academic_year_id and (p_term_id is null or t.id = p_term_id)
  left join mark_sheets ms on ms.class_id = c.id and ms.subject_id = s.id and ms.term_id = t.id
  where has_permission(current_staff_id(), 'marks.review', c.id)
    and (ms.id is null or ms.status <> 'submitted')
  order by t.sequence, c.name, s.name;
$$;
grant execute on function outstanding_mark_sheets(uuid) to authenticated;
