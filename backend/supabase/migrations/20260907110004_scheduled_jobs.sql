-- AdminSpec.md section 7 — scheduled jobs. Every job checks
-- is_school_day(current_date) first and exits if false (a holiday must not
-- produce output — section 1's non-negotiables, and section 11's stated
-- acceptance test).
--
-- Implementation note (see docs/AdminSpec.md section 17): attendance_due_at
-- lives in school_settings as a value the principal can change, but
-- pg_cron schedules are static cron expressions — there's no way to make
-- pg_cron itself follow a column's value. remind_unmarked_classes and
-- escalate_unmarked_classes are instead scheduled to run every 5 minutes
-- and each starts by checking whether the current local time (school
-- timezone, not the server's) falls inside a short window around the
-- configured time, so they only do real work once per day, at
-- (approximately) the configured moment, without needing to reschedule
-- cron whenever the setting changes.

create or replace function job_remind_unmarked_classes() returns void
language plpgsql as $$
declare
  r record;
  local_time time;
  due_at time;
begin
  if not is_school_day(current_date) then return; end if;

  select attendance_due_at into due_at from school_settings;
  select (now() at time zone (select timezone from school_settings))::time into local_time;
  if local_time < due_at or local_time >= due_at + interval '5 minutes' then return; end if;

  for r in
    select
      c.id as class_id,
      c.name as class_name,
      coalesce(
        (select ca.staff_id from cover_assignments ca
         where ca.class_id = c.id and current_date between ca.starts_on and ca.ends_on
         order by ca.created_at desc limit 1),
        c.class_teacher_id
      ) as recipient_id
    from classes c
    join academic_years ay on ay.id = c.academic_year_id and ay.is_current
    left join attendance_submissions s on s.class_id = c.id and s.on_date = current_date
    where s.id is null
  loop
    if r.recipient_id is not null then
      insert into notifications (staff_id, type, title, body, payload)
      values (
        r.recipient_id,
        'attendance.remind_unmarked',
        'Attendance not marked',
        format('%s has not marked attendance yet today.', r.class_name),
        jsonb_build_object('class_id', r.class_id, 'on_date', current_date)
      );
    end if;
  end loop;
end;
$$;

create or replace function job_escalate_unmarked_classes() returns void
language plpgsql as $$
declare
  unmarked_summary text;
  local_time time;
  due_at time;
  r record;
begin
  if not is_school_day(current_date) then return; end if;

  select attendance_due_at into due_at from school_settings;
  select (now() at time zone (select timezone from school_settings))::time into local_time;
  if local_time < due_at + interval '30 minutes' or local_time >= due_at + interval '35 minutes' then
    return;
  end if;

  select string_agg(c.name, ', ' order by c.name) into unmarked_summary
  from classes c
  join academic_years ay on ay.id = c.academic_year_id and ay.is_current
  left join attendance_submissions s on s.class_id = c.id and s.on_date = current_date
  where s.id is null;

  if unmarked_summary is null then return; end if;

  for r in
    select sr.staff_id from staff_roles sr
    join roles ro on ro.id = sr.role_id
    where ro.key = 'principal' and sr.revoked_at is null
    union
    select distinct sr.staff_id
    from classes c
    join academic_years ay on ay.id = c.academic_year_id and ay.is_current
    left join attendance_submissions s on s.class_id = c.id and s.on_date = current_date
    join staff_roles sr on sr.scope_type = 'grade' and sr.scope_id = c.grade_id and sr.revoked_at is null
    join roles ro on ro.id = sr.role_id and ro.key = 'sectional_head'
    where s.id is null
  loop
    insert into notifications (staff_id, type, title, body, payload)
    values (
      r.staff_id,
      'attendance.escalation',
      'Classes still unmarked',
      unmarked_summary,
      jsonb_build_object('on_date', current_date)
    );
  end loop;
end;
$$;

create or replace function job_lock_attendance() returns void
language sql as $$
  update attendance_submissions
  set locked_at = now()
  where locked_at is null
    and is_school_day(current_date)
    and not attendance_is_editable(class_id, on_date);
$$;

create or replace function job_detect_absence_risk() returns void
language plpgsql as $$
declare
  r record;
  school_days int;
  present_days int;
  pct numeric(5,2);
  consecutive int;
  term_start date;
  local_time time;
  due_at time;
  already_notified boolean;
  recipient uuid;
begin
  if not is_school_day(current_date) then return; end if;

  select attendance_due_at into due_at from school_settings;
  select (now() at time zone (select timezone from school_settings))::time into local_time;
  if local_time < due_at + interval '30 minutes' or local_time >= due_at + interval '35 minutes' then
    return;
  end if;

  select starts_on into term_start from terms where current_date between starts_on and ends_on limit 1;
  if term_start is null then return; end if;

  for r in
    select s.id as student_id, se.class_id, c.grade_id
    from students s
    join student_enrolments se on se.student_id = s.id
      and se.academic_year_id = (select id from academic_years where is_current)
    join classes c on c.id = se.class_id
    where s.status = 'active'
  loop
    consecutive := consecutive_absences(r.student_id, current_date);

    select count(*) into school_days
    from generate_series(term_start, current_date, interval '1 day') d
    where is_school_day(d::date);

    select count(*) into present_days
    from student_attendance sa
    where sa.student_id = r.student_id
      and sa.on_date between term_start and current_date
      and sa.status in ('present', 'late');

    pct := case when school_days > 0 then round(100.0 * present_days / school_days, 2) else 100 end;

    continue when consecutive < (select risk_consecutive_days from school_settings)
              and pct >= (select risk_attendance_pct from school_settings);

    select exists (
      select 1 from notifications
      where type = 'attendance.risk'
        and payload ->> 'student_id' = r.student_id::text
        and created_at > now() - interval '3 days'
    ) into already_notified;
    continue when already_notified;

    for recipient in
      select distinct staff_id from (
        select c.class_teacher_id as staff_id from classes c where c.id = r.class_id
        union
        select sr.staff_id from staff_roles sr
          join roles ro on ro.id = sr.role_id and ro.key = 'sectional_head'
          where sr.scope_type = 'grade' and sr.scope_id = r.grade_id and sr.revoked_at is null
        union
        select sr.staff_id from staff_roles sr
          join roles ro on ro.id = sr.role_id and ro.key = 'principal'
          where sr.revoked_at is null
      ) recipients
      where staff_id is not null
    loop
      insert into notifications (staff_id, type, title, body, payload)
      values (
        recipient,
        'attendance.risk',
        'Student attendance risk',
        format('A student has %s consecutive absences (%s%% this term).', consecutive, pct),
        jsonb_build_object('student_id', r.student_id, 'consecutive', consecutive, 'term_pct', pct)
      );
    end loop;
  end loop;
end;
$$;

select cron.schedule('remind_unmarked_classes', '*/5 * * * *', 'select job_remind_unmarked_classes()');
select cron.schedule('escalate_unmarked_classes', '*/5 * * * *', 'select job_escalate_unmarked_classes()');
select cron.schedule('lock_attendance', '0 * * * *', 'select job_lock_attendance()');
select cron.schedule('detect_absence_risk', '*/5 * * * *', 'select job_detect_absence_risk()');
