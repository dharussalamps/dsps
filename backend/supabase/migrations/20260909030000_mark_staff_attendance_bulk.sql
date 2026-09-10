-- AdminSpec.md section 15 open decision #1: staff aren't yet familiar with
-- the app, so self check-in is hidden in the client for now and
-- admin/principal mark the whole staff board's attendance in one action
-- instead. The self-check-in write path (staff_attendance's
-- self_check_in/self_check_in_update policies, check_in_self()) is left in
-- place exactly as the open decision called for ("keep the write path
-- generic so ... [another source] can supply it later") — this adds a
-- second, privileged write path alongside it, not a replacement.

-- Hosted deploys only ever run migrations — seed/003_role_permissions.sql's
-- "select all from permissions" and per-role arrays only apply on a fresh
-- local `supabase db reset` (see 20260908000012_role_permission_seed_fixes.sql)
-- — so both the permission catalog row and every role grant need to be
-- explicit here too.
insert into permissions (key, description) values
  ('attendance.mark_staff', 'Mark another staff member''s daily attendance')
on conflict (key) do nothing;

insert into role_permissions (role_id, permission_key)
select id, 'attendance.mark_staff' from roles where key in ('principal', 'vice_principal')
on conflict do nothing;

-- administrator was also missing attendance.view_board entirely, so it
-- could see the staff tab of AttendanceBoard but every row read back as its
-- own (can_view_staff_attendance() only matches p_viewer = p_target without
-- it) — needed alongside the new mark permission for admin to see who
-- they're marking.
insert into role_permissions (role_id, permission_key)
select r.id, perm
from roles r, unnest(array['attendance.view_board', 'attendance.mark_staff']) as perm
where r.key = 'administrator'
on conflict do nothing;

-- Kept as separate policies from self_check_in/self_check_in_update (that
-- pair intentionally restricts status to present/late — see its own
-- comment) so this privileged path can also set absent/on_leave: an
-- admin/principal marking the board is deliberately overriding, not
-- checking in. Postgres OR's multiple permissive policies of the same
-- command together, so a plain staff member's self check-in is unaffected.
create policy mark_staff_attendance on staff_attendance for insert
  with check (has_permission(current_staff_id(), 'attendance.mark_staff'));
create policy mark_staff_attendance_update on staff_attendance for update
  using (has_permission(current_staff_id(), 'attendance.mark_staff'))
  with check (has_permission(current_staff_id(), 'attendance.mark_staff'));

-- staff_attendance was never added to the generic audit trigger
-- (20260908000001_audit_triggers_and_fixes.sql) and never got its own
-- explicit write_audit_log call either, so self-check-in has always gone
-- unaudited — a plain gap, not a deliberate exclusion (its comment doesn't
-- mention this table). Worth closing now: one staff member setting
-- another's attendance status is exactly the write FR-ADM-04 wants a trail
-- for.
create trigger audit_staff_attendance
  after insert or update or delete on staff_attendance
  for each row execute function audit_row_change();

-- Marks the whole staff board in one round trip. SECURITY INVOKER, same
-- reasoning as check_in_self(): the policies above are the real
-- enforcement; the explicit check just turns a raw RLS violation into a
-- clear error, and wrapping every row in one function call makes the
-- multi-row write one transaction.
create or replace function mark_staff_attendance_bulk(p_on_date date, p_entries jsonb)
returns void
language plpgsql as $$
declare
  r record;
begin
  if not has_permission(current_staff_id(), 'attendance.mark_staff') then
    raise exception 'not_authorized' using errcode = 'P0001';
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
