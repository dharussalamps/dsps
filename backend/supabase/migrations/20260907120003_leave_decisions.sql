-- AdminSpec.md section 8 (POST /approve-leave) and section 11's leave
-- acceptance criteria. SECURITY DEFINER because approval/rejection touch
-- leave_balances, cover_assignments and notifications, none of which have
-- a general client write policy — unlike submit_attendance() (SECURITY
-- INVOKER), these functions must check has_permission() themselves before
-- doing anything, since RLS won't be there to stop them.

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

  -- section 11: "approval of a class teacher's leave with no cover
  -- nominated cannot be approved until a cover teacher is chosen or the
  -- principal explicitly acknowledges none is needed."
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

  -- FR-LVE-08: "the staff member shows as on leave for those dates."
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
end;
$$;
grant execute on function reject_leave(uuid, text) to authenticated;
