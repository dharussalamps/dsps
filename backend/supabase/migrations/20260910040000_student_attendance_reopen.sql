-- Class/student attendance's own version of 20260909050000_staff_attendance
-- _day_lock.sql + 20260910030000_staff_attendance_lock_after_submit.sql:
-- "only principal can unlock after submission and old dates" for student
-- attendance too. Student attendance already had its own edit-window model
-- (attendance_is_editable — 20260907110001_attendance.sql: editable until
-- attendance_edit_minutes after submitted_at, then only attendance
-- .amend_locked + a reason can still write). That model stays for same-day
-- corrections; this migration adds what it never had: a hard lock on any
-- date before today (regardless of whether it was ever submitted) that only
-- a principal can lift, mirroring staff_attendance_reopens' shape exactly
-- but keyed per (class_id, on_date) since class attendance isn't a single
-- global board.

insert into permissions (key, description) values
  ('attendance.reopen_class', 'Reopen a past date''s class/student attendance for editing by others')
on conflict (key) do nothing;

-- Principal only — same deliberate narrowing as attendance.reopen_staff
-- (not vice_principal, not administrator, unlike attendance.amend_locked
-- which both already hold). Needs its own explicit grant rather than riding
-- along with attendance.mark's class_teacher/sectional_head insert.
insert into role_permissions (role_id, permission_key)
select id, 'attendance.reopen_class' from roles where key = 'principal'
on conflict do nothing;

create table student_attendance_reopens (
  class_id      uuid not null references classes,
  on_date       date not null,
  reopened_by   uuid not null references staff,
  reopened_at   timestamptz not null default now(),
  primary key (class_id, on_date)
);
alter table student_attendance_reopens enable row level security;

-- Same visibility as attendance_submissions (attendance.view_board or
-- attendance.mark, class-scoped) — never insertable directly by a client,
-- only through the SECURITY DEFINER functions below.
create policy read_student_attendance_reopens on student_attendance_reopens for select
  using (
    has_permission(current_staff_id(), 'attendance.view_board', class_id)
    or has_permission(current_staff_id(), 'attendance.mark', class_id)
  );

-- A date is naturally editable only if it's today (subject to the existing
-- edit-window check) or it's been explicitly reopened — a past date locks
-- regardless of whether it was ever submitted, same as staff attendance.
-- Reopened always wins, including for today once its own edit window has
-- closed.
create or replace function attendance_is_editable(p_class uuid, p_date date)
returns boolean language sql stable as $$
  select
    exists (
      select 1 from student_attendance_reopens r
      where r.class_id = p_class and r.on_date = p_date
    )
    or (
      p_date = current_date
      and coalesce(
        (select now() < s.submitted_at
           + make_interval(mins => (select attendance_edit_minutes from school_settings))
         from attendance_submissions s
         where s.class_id = p_class and s.on_date = p_date),
        true)  -- not yet submitted today, therefore editable
    )
$$;
grant execute on function attendance_is_editable(uuid, date) to authenticated;

-- Reopen/close can target today (once its own edit window has closed) or
-- any past date. A future date is never a valid target — nothing to
-- reopen there.
create or replace function reopen_class_attendance_day(p_class_id uuid, p_on_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_permission(current_staff_id(), 'attendance.reopen_class', p_class_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_on_date > current_date then
    raise exception 'not_locked' using errcode = 'P0003';
  end if;

  insert into student_attendance_reopens (class_id, on_date, reopened_by)
  values (p_class_id, p_on_date, current_staff_id())
  on conflict (class_id, on_date) do update set reopened_by = excluded.reopened_by, reopened_at = now();

  perform write_audit_log('update', 'student_attendance_reopens', null, null,
    jsonb_build_object('class_id', p_class_id, 'on_date', p_on_date));
end;
$$;
grant execute on function reopen_class_attendance_day(uuid, date) to authenticated;

create or replace function close_class_attendance_day(p_class_id uuid, p_on_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_permission(current_staff_id(), 'attendance.reopen_class', p_class_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_on_date > current_date then
    raise exception 'not_locked' using errcode = 'P0003';
  end if;

  delete from student_attendance_reopens where class_id = p_class_id and on_date = p_on_date;

  perform write_audit_log('delete', 'student_attendance_reopens', null,
    jsonb_build_object('class_id', p_class_id, 'on_date', p_on_date), null);
end;
$$;
grant execute on function close_class_attendance_day(uuid, date) to authenticated;

-- Editing an already-submitted date (reopened, or today within its window)
-- from MarkAttendanceScreen — the create-only submit_attendance() function
-- always rejects a second submission for the same (class_id, on_date) with
-- 'already_submitted' (20260907110006_submit_attendance.sql's own comment:
-- editing an existing submission is deliberately a separate, always-online
-- action, not routed through that function or the offline queue). This is
-- that separate action, bulked across the whole roster in one round trip
-- instead of one amendStudentAttendance() call per student. SECURITY
-- INVOKER (the default) on purpose, same as submit_attendance: every write
-- below still goes through the caller's own amend_student_attendance /
-- write_student_attendance RLS policies (which attendance_is_editable's new
-- reopen-awareness above already covers), so this function grants nothing
-- by itself.
create or replace function amend_student_attendance_bulk(p_class_id uuid, p_on_date date, p_entries jsonb)
returns void
language plpgsql as $$
declare
  v_entry jsonb;
begin
  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    insert into student_attendance (student_id, class_id, on_date, status, reason, marked_by)
    values (
      (v_entry ->> 'student_id')::uuid,
      p_class_id,
      p_on_date,
      (v_entry ->> 'status')::attendance_status,
      v_entry ->> 'reason',
      current_staff_id()
    )
    on conflict (student_id, on_date) do update
      set status = excluded.status, reason = excluded.reason, marked_by = excluded.marked_by, marked_at = now();
  end loop;

  perform write_audit_log('update', 'student_attendance', null, null,
    jsonb_build_object('class_id', p_class_id, 'on_date', p_on_date, 'entry_count', jsonb_array_length(p_entries)));
end;
$$;
grant execute on function amend_student_attendance_bulk(uuid, date, jsonb) to authenticated;
