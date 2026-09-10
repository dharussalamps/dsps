-- Follow-up to 20260910010000_staff_attendance_reopen_required_for_all.sql:
-- today's staff attendance was unconditionally editable via the
-- `on_date = current_date` branch in the mark_staff_attendance/_update
-- policies, no matter how many times it had already been submitted.
-- Product wants today to lock itself the same way a past date does, but
-- only *after* the first bulk submit for it — the board must stay editable
-- while nobody has submitted anything yet. That "has this date already been
-- submitted" state can't be inferred from staff_attendance rows existing
-- (self check-in via check_in_self() writes rows too, and checking
-- attendance rows for "no rows yet" inside the mark_staff_attendance_bulk
-- loop would see its own prior inserts within the same transaction and
-- block every row after the first), so it gets its own tracking table,
-- same shape as staff_attendance_reopens.

create table staff_attendance_submissions (
  on_date       date primary key,
  submitted_by  uuid not null references staff,
  submitted_at  timestamptz not null default now()
);
alter table staff_attendance_submissions enable row level security;

create policy read_staff_attendance_submissions on staff_attendance_submissions for select
  using (has_permission(current_staff_id(), 'attendance.mark_staff'));

-- Same "only a SECURITY DEFINER function may write this" shape as
-- staff_attendance_reopens — mark_staff_attendance_bulk() itself stays a
-- plain invoker-rights function (its raw inserts into staff_attendance must
-- keep going through the policies below, which remain the real
-- enforcement), so it calls this helper rather than being made definer
-- itself.
create or replace function record_staff_attendance_submission(p_on_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_permission(current_staff_id(), 'attendance.mark_staff') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  insert into staff_attendance_submissions (on_date, submitted_by)
  values (p_on_date, current_staff_id())
  on conflict (on_date) do update set submitted_by = excluded.submitted_by, submitted_at = now();
end;
$$;
grant execute on function record_staff_attendance_submission(date) to authenticated;

-- A date is locked (needs a staff_attendance_reopens row to write to) when
-- it's in the past, OR it's today and already carries a submission record.
-- A past date stays locked regardless of whether it was ever submitted,
-- unchanged from the previous migration.
drop policy if exists mark_staff_attendance on staff_attendance;
drop policy if exists mark_staff_attendance_update on staff_attendance;

create policy mark_staff_attendance on staff_attendance for insert
  with check (
    has_permission(current_staff_id(), 'attendance.mark_staff')
    and (
      exists (select 1 from staff_attendance_reopens r where r.on_date = staff_attendance.on_date)
      or (
        on_date = current_date
        and not exists (select 1 from staff_attendance_submissions s where s.on_date = staff_attendance.on_date)
      )
    )
  );
create policy mark_staff_attendance_update on staff_attendance for update
  using (
    has_permission(current_staff_id(), 'attendance.mark_staff')
    and (
      exists (select 1 from staff_attendance_reopens r where r.on_date = staff_attendance.on_date)
      or (
        on_date = current_date
        and not exists (select 1 from staff_attendance_submissions s where s.on_date = staff_attendance.on_date)
      )
    )
  )
  with check (
    has_permission(current_staff_id(), 'attendance.mark_staff')
    and (
      exists (select 1 from staff_attendance_reopens r where r.on_date = staff_attendance.on_date)
      or (
        on_date = current_date
        and not exists (select 1 from staff_attendance_submissions s where s.on_date = staff_attendance.on_date)
      )
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
  if not exists (select 1 from staff_attendance_reopens where on_date = p_on_date)
     and (
       p_on_date < current_date
       or exists (select 1 from staff_attendance_submissions where on_date = p_on_date)
     ) then
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

  perform record_staff_attendance_submission(p_on_date);
end;
$$;
grant execute on function mark_staff_attendance_bulk(date, jsonb) to authenticated;

-- reopen/close can now target today too, once today is actually locked
-- (i.e. already submitted) — a future date, or today before its first
-- submit, still isn't a valid target for either.
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
  if p_on_date > current_date
     or (p_on_date = current_date and not exists (select 1 from staff_attendance_submissions where on_date = p_on_date)) then
    raise exception 'not_locked' using errcode = 'P0003';
  end if;

  insert into staff_attendance_reopens (on_date, reopened_by)
  values (p_on_date, current_staff_id())
  on conflict (on_date) do update set reopened_by = excluded.reopened_by, reopened_at = now();

  perform write_audit_log('update', 'staff_attendance_reopens', null, null, jsonb_build_object('on_date', p_on_date));
end;
$$;

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
  if p_on_date > current_date then
    raise exception 'not_past_date' using errcode = 'P0003';
  end if;

  delete from staff_attendance_reopens where on_date = p_on_date;

  perform write_audit_log('delete', 'staff_attendance_reopens', null, jsonb_build_object('on_date', p_on_date), null);
end;
$$;
