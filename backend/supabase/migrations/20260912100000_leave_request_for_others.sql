-- Business rule (not in AdminSpec.md's original role table — same kind of
-- addition as 20260910100000_student_create_admin_principal_only.sql):
-- principal and administrator may submit a leave request on behalf of
-- another staff member, seeing that staff member's balances/history before
-- submitting. Reuses current_staff_has_role() (added in that same
-- migration) rather than a new permission key, for the same reason given
-- there: "only these two roles" isn't something staff.manage lets an admin
-- reassign, so a role check is the more honest fit than a permission that
-- would look customizable but isn't.

-- requested_by distinguishes "who filed this" from staff_id ("who the leave
-- is for") — until now they were always the same value, since the insert
-- policy forced it. Backfilled from staff_id so every existing row reads as
-- self-requested, which is what actually happened.
alter table leave_requests add column requested_by uuid references staff;
update leave_requests set requested_by = staff_id;
alter table leave_requests alter column requested_by set not null;

-- Principal/administrator can now see any staff member's balances/history
-- (not just their own, an approver's, or a sectional head's section) so
-- they have what they need to decide what to request on someone's behalf.
create or replace function can_view_staff_leave(p_target_staff_id uuid)
returns boolean
language sql
stable
as $$
  select
    p_target_staff_id = current_staff_id()
    or has_permission(current_staff_id(), 'leave.approve')
    or has_permission(current_staff_id(), 'leave.view_balances')
    or current_staff_has_role(array['principal', 'administrator'])
    or exists (
      select 1
      from staff_roles sr
      join roles r on r.id = sr.role_id and r.key = 'sectional_head'
      join classes c on c.grade_id = sr.scope_id and c.class_teacher_id = p_target_staff_id
      where sr.staff_id = current_staff_id()
        and sr.scope_type = 'grade'
        and sr.revoked_at is null
    );
$$;

drop policy request_leave on leave_requests;
create policy request_leave on leave_requests for insert
  with check (
    requested_by = current_staff_id()
    and status = 'pending'
    and (staff_id = current_staff_id() or current_staff_has_role(array['principal', 'administrator']))
  );

-- Whoever filed a still-pending request can also withdraw it, not only the
-- staff member it's for — otherwise a principal who files a request for
-- someone else on the wrong dates would have no way to undo it.
drop policy withdraw_leave on leave_requests;
create policy withdraw_leave on leave_requests for update
  using ((staff_id = current_staff_id() or requested_by = current_staff_id()) and status = 'pending')
  with check ((staff_id = current_staff_id() or requested_by = current_staff_id()) and status = 'withdrawn');

-- FR-LVE-03's notification named the requester by staff_id, which was
-- always the same person as the requester until now. Switched to
-- requested_by so it correctly names whoever actually filed it, and adds a
-- separate notice to the leave's subject when someone else filed it for
-- them — they had no other way to find out.
create or replace function notify_leave_request_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester text;
  v_approver uuid;
begin
  select full_name into v_requester from staff where id = new.requested_by;
  for v_approver in
    select id from staff where status = 'active' and has_permission(id, 'leave.approve')
  loop
    insert into notifications (staff_id, type, title, body, payload)
    values (v_approver, 'leave.requested', 'New leave request',
      format('%s requested leave from %s to %s.', coalesce(v_requester, 'A staff member'), new.starts_on, new.ends_on),
      jsonb_build_object('leave_request_id', new.id, 'staff_id', new.staff_id));
  end loop;

  if new.requested_by <> new.staff_id then
    insert into notifications (staff_id, type, title, body, payload)
    values (new.staff_id, 'leave.requested_for_you', 'Leave requested on your behalf',
      format('%s requested leave for you from %s to %s.', coalesce(v_requester, 'A staff member'), new.starts_on, new.ends_on),
      jsonb_build_object('leave_request_id', new.id, 'staff_id', new.staff_id));
  end if;

  return new;
end;
$$;

-- approve_leave/reject_leave notified only the leave's subject — added a
-- notice to the requester too, when they aren't the same person, so a
-- principal/administrator who filed leave for someone else finds out the
-- outcome without having to go looking for it.
create or replace function approve_leave(
  p_request_id uuid,
  p_cover_staff_id uuid default null,
  p_cover_not_needed boolean default false,
  p_remarks text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_class_id uuid;
  v_cover_assignment_id uuid;
  v_year_id uuid;
  v_entitled numeric(4,1);
  v_day date;
begin
  if not has_permission(current_staff_id(), 'leave.approve') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_request from leave_requests where id = p_request_id and status = 'pending';
  if v_request is null then
    raise exception 'not_pending' using errcode = 'P0003';
  end if;

  select id into v_class_id from classes where class_teacher_id = v_request.staff_id limit 1;
  if v_class_id is not null and p_cover_staff_id is null and not p_cover_not_needed then
    raise exception 'cover_required' using errcode = 'P0004';
  end if;

  if v_class_id is not null and p_cover_staff_id is not null then
    insert into cover_assignments (class_id, staff_id, starts_on, ends_on, reason, assigned_by)
    values (v_class_id, p_cover_staff_id, v_request.starts_on, v_request.ends_on, 'Covering approved leave', current_staff_id())
    returning id into v_cover_assignment_id;
  end if;

  update leave_requests
  set status = 'approved',
      decided_by = current_staff_id(),
      decided_at = now(),
      cover_assignment_id = v_cover_assignment_id,
      cover_not_needed = p_cover_not_needed,
      remarks = p_remarks
  where id = p_request_id;

  select id into v_year_id from academic_years where is_current;
  select annual_entitlement into v_entitled from leave_types where id = v_request.leave_type_id;

  insert into leave_balances (staff_id, leave_type_id, academic_year_id, entitled, used)
  values (v_request.staff_id, v_request.leave_type_id, v_year_id, coalesce(v_entitled, 0), v_request.day_count)
  on conflict (staff_id, leave_type_id, academic_year_id)
  do update set used = leave_balances.used + v_request.day_count;

  v_day := v_request.starts_on;
  while v_day <= v_request.ends_on loop
    insert into staff_attendance (staff_id, on_date, status)
    values (v_request.staff_id, v_day, 'on_leave')
    on conflict (staff_id, on_date) do update set status = 'on_leave';
    v_day := v_day + 1;
  end loop;

  perform write_audit_log('approve', 'leave_requests', p_request_id, null,
    jsonb_build_object('cover_assignment_id', v_cover_assignment_id, 'cover_not_needed', p_cover_not_needed, 'remarks', p_remarks));

  insert into notifications (staff_id, type, title, body, payload)
  values (v_request.staff_id, 'leave.approved', 'Leave approved',
    case when p_remarks is not null
      then format('Your leave from %s to %s has been approved. %s', v_request.starts_on, v_request.ends_on, p_remarks)
      else format('Your leave from %s to %s has been approved.', v_request.starts_on, v_request.ends_on)
    end,
    jsonb_build_object('leave_request_id', p_request_id));

  if v_request.requested_by <> v_request.staff_id then
    insert into notifications (staff_id, type, title, body, payload)
    values (v_request.requested_by, 'leave.approved', 'Leave request approved',
      format('The leave you requested for %s (%s to %s) has been approved.',
        (select full_name from staff where id = v_request.staff_id), v_request.starts_on, v_request.ends_on),
      jsonb_build_object('leave_request_id', p_request_id));
  end if;

  if v_cover_assignment_id is not null then
    insert into notifications (staff_id, type, title, body, payload)
    values (p_cover_staff_id, 'cover.assigned', 'You have been assigned to cover a class',
      format('Covering %s from %s to %s.', (select name from classes where id = v_class_id), v_request.starts_on, v_request.ends_on),
      jsonb_build_object('class_id', v_class_id, 'cover_assignment_id', v_cover_assignment_id));
  end if;
end;
$$;
grant execute on function approve_leave(uuid, uuid, boolean, text) to authenticated;

create or replace function reject_leave(p_request_id uuid, p_remarks text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
begin
  if not has_permission(current_staff_id(), 'leave.approve') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_request from leave_requests where id = p_request_id and status = 'pending';
  if v_request is null then
    raise exception 'not_pending' using errcode = 'P0003';
  end if;

  update leave_requests
  set status = 'rejected', decided_by = current_staff_id(), decided_at = now(), remarks = p_remarks
  where id = p_request_id;

  perform write_audit_log('reject', 'leave_requests', p_request_id, null, jsonb_build_object('remarks', p_remarks));

  insert into notifications (staff_id, type, title, body, payload)
  values (v_request.staff_id, 'leave.rejected', 'Leave request rejected',
    coalesce(p_remarks, 'Your leave request was not approved.'),
    jsonb_build_object('leave_request_id', p_request_id));

  if v_request.requested_by <> v_request.staff_id then
    insert into notifications (staff_id, type, title, body, payload)
    values (v_request.requested_by, 'leave.rejected', 'Leave request rejected',
      format('The leave you requested for %s (%s to %s) was not approved.%s',
        (select full_name from staff where id = v_request.staff_id), v_request.starts_on, v_request.ends_on,
        case when p_remarks is not null then ' ' || p_remarks else '' end),
      jsonb_build_object('leave_request_id', p_request_id));
  end if;
end;
$$;
grant execute on function reject_leave(uuid, text) to authenticated;
