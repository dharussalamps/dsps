-- Follow-up to 20260909050000_staff_attendance_day_lock.sql: that migration's
-- own comment noted "no delete/re-lock action exists yet — not asked for."
-- Now asked for — a principal can lock a previously-reopened past date back
-- up, mirroring reopen_staff_attendance_day()'s shape exactly (same
-- permission check, same date-must-be-in-the-past guard, same audit call).
-- Today is never a valid target for either function: it's unconditionally
-- editable via the `on_date = current_date` branch in the
-- mark_staff_attendance/_update policies, so removing (or never creating) a
-- staff_attendance_reopens row for it has no locking effect anyway.

create or replace function close_staff_attendance_day(p_on_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_permission(current_staff_id(), 'attendance.reopen_staff') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_on_date >= current_date then
    raise exception 'not_past_date' using errcode = 'P0003';
  end if;

  delete from staff_attendance_reopens where on_date = p_on_date;

  perform write_audit_log('delete', 'staff_attendance_reopens', null, jsonb_build_object('on_date', p_on_date), null);
end;
$$;
grant execute on function close_staff_attendance_day(date) to authenticated;
