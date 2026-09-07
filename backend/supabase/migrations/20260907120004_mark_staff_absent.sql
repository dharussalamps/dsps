-- AdminSpec.md section 7 — mark_staff_absent. References leave_requests
-- (build task 13), so it lands after that table rather than with the rest
-- of task 12's jobs. Same static-schedule-can't-follow-a-setting workaround
-- as the attendance jobs — see ..._scheduled_jobs.sql's comment.
create or replace function job_mark_staff_absent() returns void
language plpgsql as $$
declare
  local_time time;
  day_end time;
  r record;
begin
  if not is_school_day(current_date) then return; end if;

  select day_ends_at into day_end from school_settings;
  select (now() at time zone (select timezone from school_settings))::time into local_time;
  if local_time < day_end or local_time >= day_end + interval '5 minutes' then return; end if;

  for r in
    select s.id as staff_id
    from staff s
    where s.status = 'active'
      and not exists (select 1 from staff_attendance sa where sa.staff_id = s.id and sa.on_date = current_date)
      and not exists (
        select 1 from leave_requests lr
        where lr.staff_id = s.id and lr.status = 'approved'
          and current_date between lr.starts_on and lr.ends_on
      )
  loop
    insert into staff_attendance (staff_id, on_date, status)
    values (r.staff_id, current_date, 'absent')
    on conflict (staff_id, on_date) do nothing;
  end loop;
end;
$$;

select cron.schedule('mark_staff_absent', '*/5 * * * *', 'select job_mark_staff_absent()');
