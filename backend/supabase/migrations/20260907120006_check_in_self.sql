-- AdminSpec.md section 15 open decision #1 (self check-in) and
-- school_settings.staff_late_after. SECURITY INVOKER is enough here (the
-- self_check_in/self_check_in_update RLS policies already let a staff
-- member write their own row) — this function exists so "late" is decided
-- by the server's clock and the configured cutoff, not a client-reported
-- status that would be trivial to spoof as always "present".
create or replace function check_in_self() returns void
language plpgsql as $$
declare
  v_staff_id uuid := current_staff_id();
  v_late_after time;
  v_now_time time;
  v_status staff_attendance_status;
begin
  if v_staff_id is null then
    raise exception 'no_staff_record' using errcode = 'P0001';
  end if;

  select staff_late_after into v_late_after from school_settings;
  select (now() at time zone (select timezone from school_settings))::time into v_now_time;
  v_status := case when v_now_time > v_late_after then 'late' else 'present' end;

  insert into staff_attendance (staff_id, on_date, checked_in_at, status)
  values (v_staff_id, current_date, now(), v_status)
  on conflict (staff_id, on_date) do update set checked_in_at = now(), status = v_status;
end;
$$;
grant execute on function check_in_self() to authenticated;
