-- Follow-up to 20260909050000_staff_attendance_day_lock.sql: that migration
-- let anyone holding attendance.reopen_staff (principal) write straight to
-- a past date without reopening it first, on the theory that "the person
-- who can unlock a day doesn't need to unlock it for themselves." Product
-- wants a stricter rule instead — a past date is locked for *everyone*,
-- principal included, until a staff_attendance_reopens row exists for it.
-- attendance.reopen_staff now only gates the reopen action itself
-- (reopen_staff_attendance_day(), unchanged below); it no longer doubles as
-- a write bypass. This makes "was this date ever unlocked, by whom, when"
-- a complete answer straight from staff_attendance_reopens, with no
-- principal-direct-write case that would leave it looking untouched.

drop policy if exists mark_staff_attendance on staff_attendance;
drop policy if exists mark_staff_attendance_update on staff_attendance;

create policy mark_staff_attendance on staff_attendance for insert
  with check (
    has_permission(current_staff_id(), 'attendance.mark_staff')
    and (
      on_date = current_date
      or exists (select 1 from staff_attendance_reopens r where r.on_date = staff_attendance.on_date)
    )
  );
create policy mark_staff_attendance_update on staff_attendance for update
  using (
    has_permission(current_staff_id(), 'attendance.mark_staff')
    and (
      on_date = current_date
      or exists (select 1 from staff_attendance_reopens r where r.on_date = staff_attendance.on_date)
    )
  )
  with check (
    has_permission(current_staff_id(), 'attendance.mark_staff')
    and (
      on_date = current_date
      or exists (select 1 from staff_attendance_reopens r where r.on_date = staff_attendance.on_date)
    )
  );

create or replace function mark_staff_attendance_bulk(p_on_date date, p_entries jsonb)
returns void
language plpgsql as $$
declare
  r record;
begin
  if not has_permission(current_staff_id(), 'attendance.mark_staff') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_on_date <> current_date
     and not exists (select 1 from staff_attendance_reopens where on_date = p_on_date) then
    raise exception 'date_locked' using errcode = 'P0001';
  end if;

  for r in select * from jsonb_to_recordset(p_entries) as x(staff_id uuid, status text)
  loop
    if r.status not in ('present', 'late', 'absent', 'on_leave') then
      raise exception 'invalid_status' using errcode = 'P0001';
    end if;

    insert into staff_attendance (staff_id, on_date, status, checked_in_at)
    values (
      r.staff_id, p_on_date, r.status::staff_attendance_status,
      case when r.status in ('present', 'late') then now() else null end
    )
    on conflict (staff_id, on_date) do update
      set status = excluded.status, checked_in_at = excluded.checked_in_at;
  end loop;
end;
$$;
grant execute on function mark_staff_attendance_bulk(date, jsonb) to authenticated;
