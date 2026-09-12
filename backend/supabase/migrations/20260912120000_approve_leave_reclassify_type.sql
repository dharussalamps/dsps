-- Lets the approver reclassify a pending request's leave type at approval
-- time (e.g. staff filed Medical Leave, principal decides it should count
-- as Casual Leave instead) — requested because Casual/Medical/Duty are
-- filed by the staff member's own judgment call and the principal is the
-- one who actually knows which bucket it belongs in. Restricted to these
-- three types in both directions: they're the only leave types that are a
-- plain annual entitlement with nothing else attached. Maternity (phase
-- chain), Short Leave (fixed monthly cap, not a leave_balances row) and
-- Half Day (not a real standalone type) all carry logic a blind type swap
-- would break, so reclassifying into or out of any of them is refused.
create or replace function approve_leave(
  p_request_id uuid,
  p_cover_staff_id uuid default null,
  p_cover_not_needed boolean default false,
  p_remarks text default null,
  p_leave_type_id uuid default null
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
  v_leave_type_id uuid;
begin
  if not has_permission(current_staff_id(), 'leave.approve') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_request from leave_requests where id = p_request_id and status = 'pending';
  if v_request is null then
    raise exception 'not_pending' using errcode = 'P0003';
  end if;

  v_leave_type_id := coalesce(p_leave_type_id, v_request.leave_type_id);

  if v_leave_type_id <> v_request.leave_type_id then
    if not exists (select 1 from leave_types where id = v_request.leave_type_id and key in ('casual', 'medical', 'duty'))
      or not exists (select 1 from leave_types where id = v_leave_type_id and key in ('casual', 'medical', 'duty')) then
      raise exception 'leave_type_not_reclassifiable' using errcode = 'P0005';
    end if;
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
      leave_type_id = v_leave_type_id,
      decided_by = current_staff_id(),
      decided_at = now(),
      cover_assignment_id = v_cover_assignment_id,
      cover_not_needed = p_cover_not_needed,
      remarks = p_remarks
  where id = p_request_id;

  select id into v_year_id from academic_years where is_current;
  select annual_entitlement into v_entitled from leave_types where id = v_leave_type_id;

  insert into leave_balances (staff_id, leave_type_id, academic_year_id, entitled, used)
  values (v_request.staff_id, v_leave_type_id, v_year_id, coalesce(v_entitled, 0), v_request.day_count)
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
    jsonb_build_object(
      'cover_assignment_id', v_cover_assignment_id,
      'cover_not_needed', p_cover_not_needed,
      'remarks', p_remarks,
      'reclassified_leave_type_id', case when v_leave_type_id <> v_request.leave_type_id then v_leave_type_id else null end
    ));

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
grant execute on function approve_leave(uuid, uuid, boolean, text, uuid) to authenticated;
