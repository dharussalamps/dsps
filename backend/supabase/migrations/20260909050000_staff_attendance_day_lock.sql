-- Follow-up to 20260909030000_mark_staff_attendance_bulk.sql: today's staff
-- attendance stays freely editable by anyone holding attendance.mark_staff
-- (administrator, vice_principal, principal), but a *past* date locks
-- itself down to principal only, the same "supervisor can override, but
-- override is its own permission" shape as marks.reopen (see
-- reopen_mark_sheet() in 20260907130001_marks.sql) — except here the thing
-- being reopened is a whole day across every staff member, not one class's
-- mark sheet, so it needs its own small tracking table rather than a status
-- column on an existing row.

insert into permissions (key, description) values
  ('attendance.reopen_staff', 'Reopen a past date''s staff attendance for editing by others')
on conflict (key) do nothing;

-- Principal only — not vice_principal, unlike every other attendance.*
-- permission added so far. This is deliberately narrower than "all
-- permissions", so it needs its own explicit grant rather than riding
-- along with attendance.mark_staff's principal/vice_principal insert in
-- the previous migration.
insert into role_permissions (role_id, permission_key)
select id, 'attendance.reopen_staff' from roles where key = 'principal'
on conflict do nothing;

-- One row per date that's been explicitly reopened; absence of a row means
-- "still locked" for anyone without attendance.reopen_staff. No delete/
-- re-lock action exists yet — not asked for, and staying reopened once a
-- principal has looked at a date and chosen to unlock it is the safer
-- default (accidentally re-locking someone mid-edit would be worse).
create table staff_attendance_reopens (
  on_date       date primary key,
  reopened_by   uuid not null references staff,
  reopened_at   timestamptz not null default now()
);
alter table staff_attendance_reopens enable row level security;

-- Readable by anyone who can mark staff attendance at all (so the app can
-- show "reopened by X" on a previously-locked date) — never insertable
-- directly by a client, same "only a SECURITY DEFINER function may write
-- this" shape as write_audit_log, so nobody can forge a reopen.
create policy read_staff_attendance_reopens on staff_attendance_reopens for select
  using (has_permission(current_staff_id(), 'attendance.mark_staff'));

create or replace function reopen_staff_attendance_day(p_on_date date)
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
    raise exception 'not_locked' using errcode = 'P0003';
  end if;

  insert into staff_attendance_reopens (on_date, reopened_by)
  values (p_on_date, current_staff_id())
  on conflict (on_date) do update set reopened_by = excluded.reopened_by, reopened_at = now();

  perform write_audit_log('update', 'staff_attendance_reopens', null, null, jsonb_build_object('on_date', p_on_date));
end;
$$;
grant execute on function reopen_staff_attendance_day(date) to authenticated;

-- Re-scope the two write policies from the previous migration: still needs
-- attendance.mark_staff, but now also needs the date to be today, or the
-- caller to hold attendance.reopen_staff themselves (principal, who never
-- needs a date reopened for their own edits), or the date to already carry
-- a staff_attendance_reopens row (an administrator/vice_principal editing a
-- date the principal reopened for them).
drop policy if exists mark_staff_attendance on staff_attendance;
drop policy if exists mark_staff_attendance_update on staff_attendance;

create policy mark_staff_attendance on staff_attendance for insert
  with check (
    has_permission(current_staff_id(), 'attendance.mark_staff')
    and (
      on_date = current_date
      or has_permission(current_staff_id(), 'attendance.reopen_staff')
      or exists (select 1 from staff_attendance_reopens r where r.on_date = staff_attendance.on_date)
    )
  );
create policy mark_staff_attendance_update on staff_attendance for update
  using (
    has_permission(current_staff_id(), 'attendance.mark_staff')
    and (
      on_date = current_date
      or has_permission(current_staff_id(), 'attendance.reopen_staff')
      or exists (select 1 from staff_attendance_reopens r where r.on_date = staff_attendance.on_date)
    )
  )
  with check (
    has_permission(current_staff_id(), 'attendance.mark_staff')
    and (
      on_date = current_date
      or has_permission(current_staff_id(), 'attendance.reopen_staff')
      or exists (select 1 from staff_attendance_reopens r where r.on_date = staff_attendance.on_date)
    )
  );

-- mark_staff_attendance_bulk() gets the same date check up front, as a
-- clear 'date_locked' error instead of every row in the batch failing on
-- the RLS violation above (the policies remain the real enforcement).
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
     and not has_permission(current_staff_id(), 'attendance.reopen_staff')
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
