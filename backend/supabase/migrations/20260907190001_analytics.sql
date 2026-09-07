-- AdminSpec.md section 4.10 (attendance_summaries) and section 7
-- (recompute_summaries). Build task 20.

create table attendance_summaries (
  id            uuid primary key default gen_random_uuid(),
  scope_type    text not null,        -- 'student','class','grade','school'
  scope_id      uuid,
  term_id       uuid references terms,
  school_days   integer not null,
  present_days  integer not null,
  pct           numeric(5,2) not null,
  computed_at   timestamptz not null default now(),
  unique (scope_type, scope_id, term_id)
);
alter table attendance_summaries enable row level security;

-- Readable by analytics.view; scope_id is a student/class/grade id or null
-- (school-wide) — reuse has_permission()'s class_id parameter where
-- scope_type = 'class' so a class-scoped role only sees its own class's
-- row, same pattern as everywhere else. Grade/student/school rows fall
-- back to a school-scope check since has_permission() has no equivalent
-- "is this student/grade in my scope" resolution for a summary row alone.
create policy read_attendance_summaries on attendance_summaries for select
  using (
    (scope_type = 'class' and has_permission(current_staff_id(), 'analytics.view', scope_id))
    or (scope_type <> 'class' and has_permission(current_staff_id(), 'analytics.view'))
  );
-- No client write policy — only recompute_summaries (below) writes these.

create or replace function recompute_attendance_summaries() returns void
language plpgsql as $$
declare
  v_term record;
  v_school_days int;
  r record;
begin
  select id, starts_on, ends_on into v_term from terms where current_date between starts_on and ends_on limit 1;
  if v_term is null then return; end if;

  select count(*) into v_school_days
  from generate_series(v_term.starts_on, least(current_date, v_term.ends_on), interval '1 day') d
  where is_school_day(d::date);
  if v_school_days = 0 then return; end if;

  -- per student
  for r in
    select s.id as student_id, count(*) filter (where sa.status in ('present', 'late')) as present_days
    from students s
    left join student_attendance sa on sa.student_id = s.id and sa.on_date between v_term.starts_on and v_term.ends_on
    where s.status = 'active'
    group by s.id
  loop
    insert into attendance_summaries (scope_type, scope_id, term_id, school_days, present_days, pct)
    values ('student', r.student_id, v_term.id, v_school_days, r.present_days, round(100.0 * r.present_days / v_school_days, 2))
    on conflict (scope_type, scope_id, term_id)
    do update set school_days = excluded.school_days, present_days = excluded.present_days, pct = excluded.pct, computed_at = now();
  end loop;

  -- per class
  for r in
    select c.id as class_id, count(*) filter (where sa.status in ('present', 'late')) as present_days, count(distinct se.student_id) * v_school_days as possible
    from classes c
    join student_enrolments se on se.class_id = c.id
    join academic_years ay on ay.id = c.academic_year_id and ay.is_current
    left join student_attendance sa on sa.class_id = c.id and sa.on_date between v_term.starts_on and v_term.ends_on
    group by c.id
  loop
    continue when r.possible = 0;
    insert into attendance_summaries (scope_type, scope_id, term_id, school_days, present_days, pct)
    values ('class', r.class_id, v_term.id, r.possible, r.present_days, round(100.0 * r.present_days / r.possible, 2))
    on conflict (scope_type, scope_id, term_id)
    do update set school_days = excluded.school_days, present_days = excluded.present_days, pct = excluded.pct, computed_at = now();
  end loop;

  -- per grade
  for r in
    select g.id as grade_id, count(*) filter (where sa.status in ('present', 'late')) as present_days, count(distinct se.student_id) * v_school_days as possible
    from grades g
    join classes c on c.grade_id = g.id
    join academic_years ay on ay.id = c.academic_year_id and ay.is_current
    join student_enrolments se on se.class_id = c.id
    left join student_attendance sa on sa.class_id = c.id and sa.on_date between v_term.starts_on and v_term.ends_on
    group by g.id
  loop
    continue when r.possible = 0;
    insert into attendance_summaries (scope_type, scope_id, term_id, school_days, present_days, pct)
    values ('grade', r.grade_id, v_term.id, r.possible, r.present_days, round(100.0 * r.present_days / r.possible, 2))
    on conflict (scope_type, scope_id, term_id)
    do update set school_days = excluded.school_days, present_days = excluded.present_days, pct = excluded.pct, computed_at = now();
  end loop;

  -- school-wide
  select count(*) filter (where sa.status in ('present', 'late')) as present_days, count(distinct se.student_id) * v_school_days as possible
  into r
  from student_enrolments se
  join academic_years ay on ay.id = se.academic_year_id and ay.is_current
  left join student_attendance sa on sa.student_id = se.student_id and sa.on_date between v_term.starts_on and v_term.ends_on;

  if r.possible > 0 then
    insert into attendance_summaries (scope_type, scope_id, term_id, school_days, present_days, pct)
    values ('school', null, v_term.id, r.possible, r.present_days, round(100.0 * r.present_days / r.possible, 2))
    on conflict (scope_type, scope_id, term_id)
    do update set school_days = excluded.school_days, present_days = excluded.present_days, pct = excluded.pct, computed_at = now();
  end if;
end;
$$;

-- section 7: recompute_summaries, nightly 01:00. Deliberately NOT gated
-- on is_school_day(current_date), unlike every other job — by 1am the
-- date has already rolled over to the day *after* the one being
-- summarized, so checking "is today a school day" answers the wrong
-- question. More importantly, this job rebuilds cumulative term-to-date
-- totals, not "did something happen today" — skipping it because the
-- night it happens to run on follows a holiday would let summaries go
-- stale across a whole break. See docs/AdminSpec.md section 17.
create or replace function job_recompute_summaries() returns void
language sql as $$
  select recompute_attendance_summaries();
$$;
select cron.schedule('recompute_summaries', '0 1 * * *', 'select job_recompute_summaries()');
