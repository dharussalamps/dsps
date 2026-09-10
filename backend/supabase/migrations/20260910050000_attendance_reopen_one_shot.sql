-- Follow-up to 20260910040000_student_attendance_reopen.sql. That migration
-- made a *past* date lock the same way staff attendance does, but left a
-- reopened date open indefinitely — a principal's reopen stayed in effect
-- until someone remembered to call close_class_attendance_day, even after
-- the teacher had already made their correction and resubmitted. Product
-- wants a reopened old day to be a one-shot edit window instead: the same
-- amend-and-resubmit action that uses it should also lock it back
-- immediately, no separate close step needed.
--
-- Today keeps its own, different model: an edit_minutes buffer (default 60,
-- section 6.2) that always applies to *today* specifically, whether it
-- started at the original submit or — new here — at a principal's reopen of
-- today after that window had already closed. A reopen of today is not
-- one-shot; it just grants the same hour-long buffer again, consistent with
-- "only the current day gets a time buffer."

-- Today: editable while within edit_minutes of either the original submit
-- (or not yet submitted at all) OR a reopen — reopening today re-grants the
-- same buffer rather than unlocking it indefinitely.
-- Any other date: editable only while a student_attendance_reopens row
-- exists at all, with no time component — amend_student_attendance_bulk
-- below deletes that row the moment it's used, so "editable" here really
-- means "has an unused reopen."
create or replace function attendance_is_editable(p_class uuid, p_date date)
returns boolean language sql stable as $$
  select case
    when p_date = current_date then
      coalesce(
        (select now() < s.submitted_at
           + make_interval(mins => (select attendance_edit_minutes from school_settings))
         from attendance_submissions s
         where s.class_id = p_class and s.on_date = p_date),
        true) -- not yet submitted today, therefore editable
      or exists (
        select 1 from student_attendance_reopens r
        where r.class_id = p_class and r.on_date = p_date
          and now() < r.reopened_at + make_interval(mins => (select attendance_edit_minutes from school_settings))
      )
    else
      exists (
        select 1 from student_attendance_reopens r
        where r.class_id = p_class and r.on_date = p_date
      )
  end
$$;
grant execute on function attendance_is_editable(uuid, date) to authenticated;

-- SECURITY DEFINER helper so amend_student_attendance_bulk (deliberately
-- SECURITY INVOKER — see its own comment) can consume a past date's reopen
-- without needing a direct delete policy on student_attendance_reopens for
-- ordinary attendance.mark holders. Same shape as
-- record_staff_attendance_submission: no permission check of its own,
-- because it's only ever reached after amend_student_attendance_bulk's own
-- RLS-gated writes already succeeded, and deleting a reopen row that
-- doesn't exist (e.g. called for today, or a date nobody reopened) is a
-- harmless no-op.
create or replace function consume_class_attendance_reopen(p_class_id uuid, p_on_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from student_attendance_reopens where class_id = p_class_id and on_date = p_on_date;
end;
$$;
grant execute on function consume_class_attendance_reopen(uuid, date) to authenticated;

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

  -- One-shot: a reopened past date locks itself back the moment this
  -- whole-class resubmit succeeds. Today never hits this — its buffer
  -- expires on its own via attendance_is_editable's time check above.
  if p_on_date <> current_date then
    perform consume_class_attendance_reopen(p_class_id, p_on_date);
  end if;

  perform write_audit_log('update', 'student_attendance', null, null,
    jsonb_build_object('class_id', p_class_id, 'on_date', p_on_date, 'entry_count', jsonb_array_length(p_entries)));
end;
$$;
grant execute on function amend_student_attendance_bulk(uuid, date, jsonb) to authenticated;
