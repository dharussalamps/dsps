-- Last 7 school days' attendance % for one class, backing the sparkline
-- added to MyClassAttendanceCard on Home. Walks back day by day (capped at
-- 60 calendar days so a long holiday stretch can't make this scan
-- unbounded) picking out school days via is_school_day()
-- (20260907100003_is_school_day.sql) — the same derivation the "Not a
-- school day" banner on Home already relies on. student_attendance's own
-- RLS (attendance.view_board or attendance.mark, per class —
-- 20260907110001_attendance.sql) scopes the result, same unguarded stable-
-- function pattern as the rest of this migration set.
create or replace function class_attendance_trend(p_class_id uuid)
returns table (on_date date, pct numeric)
language sql
stable
as $$
  with days as (
    select d::date as on_date
    from generate_series(current_date - 60, current_date, interval '1 day') d
    where is_school_day(d::date)
    order by on_date desc
    limit 7
  )
  select
    days.on_date,
    round(
      100.0 * count(*) filter (where sa.status in ('present', 'late'))
      / nullif(count(sa.id), 0),
      1
    ) as pct
  from days
  left join student_attendance sa on sa.class_id = p_class_id and sa.on_date = days.on_date
  group by days.on_date
  order by days.on_date;
$$;
grant execute on function class_attendance_trend(uuid) to authenticated;
