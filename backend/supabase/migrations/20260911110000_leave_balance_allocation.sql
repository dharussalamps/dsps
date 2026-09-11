-- Fills the gap noted at leave.sql's "No client write policy" comment:
-- leave_balances.entitled was only ever set lazily, inside approve_leave(),
-- copied from leave_types.annual_entitlement the first time a staff
-- member's leave got approved. There was no way for the principal to
-- review or override a specific staff member's entitlement ahead of time,
-- per academic year. This adds that single write path.

create or replace function set_leave_balance(
  p_staff_id uuid,
  p_leave_type_id uuid,
  p_academic_year_id uuid,
  p_entitled numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance_id uuid;
begin
  if not has_permission(current_staff_id(), 'leave.approve') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into leave_balances (staff_id, leave_type_id, academic_year_id, entitled, used)
  values (p_staff_id, p_leave_type_id, p_academic_year_id, p_entitled, 0)
  on conflict (staff_id, leave_type_id, academic_year_id)
  do update set entitled = excluded.entitled
  returning id into v_balance_id;

  perform write_audit_log('allocate', 'leave_balances', v_balance_id, null,
    jsonb_build_object(
      'staff_id', p_staff_id,
      'leave_type_id', p_leave_type_id,
      'academic_year_id', p_academic_year_id,
      'entitled', p_entitled
    ));
end;
$$;
grant execute on function set_leave_balance(uuid, uuid, uuid, numeric) to authenticated;
