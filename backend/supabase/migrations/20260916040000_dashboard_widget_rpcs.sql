-- Three read functions backing the new Home widgets: today's birthdays,
-- academic performance, and who's on leave today (School Pulse upgrade).
-- Each is a plain `language sql stable` function with no `security
-- definer`, so it runs as the caller and is scoped entirely by the
-- underlying tables' own RLS policies — the same unguarded pattern as
-- students_at_risk() (20260908000007_analytics_scope_and_risk.sql) and
-- class_subject_average() (20260907130001_marks.sql). Never reimplement
-- permission logic client-side; an empty/null result just hides the card,
-- same convention as every other Home block.

-- Today's birthdays among active students and staff. No extra permission
-- gate: full names are already broadly readable via StudentSearch /
-- StaffDirectory, so this list carries no more exposure than those screens.
create or replace function todays_birthdays()
returns table (person_type text, id uuid, full_name text, detail text)
language sql
stable
as $$
  select 'student', s.id, s.full_name, c.name
  from students s
  left join student_enrolments se on se.student_id = s.id
  left join academic_years ay on ay.id = se.academic_year_id and ay.is_current
  left join classes c on c.id = se.class_id
  where s.status = 'active'
    and s.date_of_birth is not null
    and extract(month from s.date_of_birth) = extract(month from current_date)
    and extract(day from s.date_of_birth) = extract(day from current_date)
  union all
  select 'staff', st.id, st.full_name, null
  from staff st
  where st.status = 'active'
    and st.birth_date is not null
    and extract(month from st.birth_date) = extract(month from current_date)
    and extract(day from st.birth_date) = extract(day from current_date);
$$;
grant execute on function todays_birthdays() to authenticated;

-- Current-term academic snapshot: average score (as a % of each sheet's
-- max_score) and how many students are averaging below a 40% pass mark
-- this term. marks/mark_sheets' own RLS (marks.enter or marks.review, per
-- class — 20260907130001_marks.sql) already scopes every row to what the
-- caller may see, exactly like class_subject_average() beside it; a caller
-- who can see no marks gets a single null-avg_pct row back, and the Home
-- card hides itself.
create or replace function academic_performance_summary()
returns table (avg_pct numeric, at_risk_count int)
language sql
stable
as $$
  with scored as (
    select m.student_id, (m.score / ms.max_score) * 100 as pct
    from marks m
    join mark_sheets ms on ms.id = m.mark_sheet_id
    where ms.term_id = (select id from terms where current_date between starts_on and ends_on limit 1)
      and m.score is not null
  ), per_student as (
    select student_id, avg(pct) as avg_pct
    from scored
    group by student_id
  )
  select round(avg(avg_pct), 1), count(*) filter (where avg_pct < 40)
  from per_student;
$$;
grant execute on function academic_performance_summary() to authenticated;

-- Staff currently on approved leave today, for the School Pulse widget's
-- upgrade. Relies entirely on leave_requests' own read policy
-- (can_view_staff_leave(), 20260907120002_leave.sql) to scope which staff
-- members' leave the caller may see.
create or replace function staff_on_leave_today()
returns table (staff_id uuid, full_name text)
language sql
stable
as $$
  select st.id, st.full_name
  from leave_requests lr
  join staff st on st.id = lr.staff_id
  where lr.status = 'approved'
    and current_date between lr.starts_on and lr.ends_on
  order by st.full_name;
$$;
grant execute on function staff_on_leave_today() to authenticated;
