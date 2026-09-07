-- pgTAP test for AdminSpec.md section 11: "Given today is a holiday in
-- calendar_days, when the reminder job runs, then it sends nothing and
-- creates no notification rows." Extended here to all four attendance
-- jobs from section 7, since every one of them is required to check
-- is_school_day(current_date) first (section 1's non-negotiables).
--
-- Runs each job with today's date pinned to a fixed, deliberately-seeded
-- holiday via calendar_days, so this test is not sensitive to whatever
-- today's real date happens to be when it runs.

begin;
select plan(5);

-- A fixed future date so this never collides with real seed data,
-- declared a holiday.
insert into calendar_days (on_date, day_type, label)
values ('2099-06-15', 'holiday', 'Test Holiday');

-- Pin "today" for is_school_day() and the jobs by temporarily faking the
-- session's date via a SET, is not directly possible for current_date in
-- Postgres — instead we rely on the holiday being far enough in the future
-- that it can't be today, and separately prove the gating logic directly:
-- is_school_day() itself returns false for the holiday date, which is what
-- every job's first line depends on. This is the reusable, deterministic
-- part; running the jobs against *actual* today additionally requires
-- today to be seeded as a holiday, which 900_dev_sample_data.sql does not
-- do (it seeds a holiday inside the current term at a fixed date instead).
select ok(
  not is_school_day('2099-06-15'::date),
  'is_school_day returns false for a seeded holiday'
);

-- Prove each job's early-exit is actually reachable: temporarily retarget
-- the holiday to real "today" so the jobs' is_school_day(current_date)
-- check is exercised end-to-end, then confirm zero rows were produced.
insert into calendar_days (on_date, day_type, label)
values (current_date, 'holiday', 'Test Holiday (today)')
on conflict (on_date) do update set day_type = 'holiday', label = 'Test Holiday (today)';

select job_remind_unmarked_classes();
select is(
  (select count(*)::int from notifications where type = 'attendance.remind_unmarked' and created_at > now() - interval '1 minute'),
  0,
  'remind_unmarked_classes creates no notifications on a holiday'
);

select job_escalate_unmarked_classes();
select is(
  (select count(*)::int from notifications where type = 'attendance.escalation' and created_at > now() - interval '1 minute'),
  0,
  'escalate_unmarked_classes creates no notifications on a holiday'
);

select job_detect_absence_risk();
select is(
  (select count(*)::int from notifications where type = 'attendance.risk' and created_at > now() - interval '1 minute'),
  0,
  'detect_absence_risk creates no notifications on a holiday'
);

select job_lock_attendance();
select is(
  (select count(*)::int from attendance_submissions where locked_at > now() - interval '1 minute'),
  0,
  'lock_attendance locks nothing on a holiday'
);

select * from finish();
rollback;
