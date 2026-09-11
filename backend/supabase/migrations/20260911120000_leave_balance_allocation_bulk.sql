-- Bulk companion to set_leave_balance(): "set 7 days for everyone at once"
-- for a given leave type + academic year, rather than one staff member at
-- a time. Same permission gate, same conflict-safe upsert, done set-based
-- in one statement instead of looping N client round trips, with a single
-- audit row (staff_count) instead of N.

create or replace function set_leave_balances_for_all(
  p_leave_type_id uuid,
  p_academic_year_id uuid,
  p_entitled numeric
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not has_permission(current_staff_id(), 'leave.approve') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with upserted as (
    insert into leave_balances (staff_id, leave_type_id, academic_year_id, entitled, used)
    select id, p_leave_type_id, p_academic_year_id, p_entitled, 0
    from staff
    where status = 'active'
    on conflict (staff_id, leave_type_id, academic_year_id)
    do update set entitled = excluded.entitled
    returning 1
  )
  select count(*) into v_count from upserted;

  perform write_audit_log('allocate_bulk', 'leave_balances', p_leave_type_id, null,
    jsonb_build_object(
      'leave_type_id', p_leave_type_id,
      'academic_year_id', p_academic_year_id,
      'entitled', p_entitled,
      'staff_count', v_count
    ));

  return v_count;
end;
$$;
grant execute on function set_leave_balances_for_all(uuid, uuid, numeric) to authenticated;
