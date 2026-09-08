-- FR-ADM-06 (P1): "existing student and staff records are imported once
-- from the school's spreadsheets, with a reconciliation report of rows
-- accepted and rejected." Only the student half existed (20260907210001_
-- import_students.sql, whose own comment says the staff/guardian/class
-- version "would follow the identical row-by-row-savepoint shape but
-- aren't built in this pass"). Same shape here: same per-row BEGIN/
-- EXCEPTION savepoint so one bad row doesn't block or corrupt its
-- neighbors, gated on the same kind of permission (staff.manage — the
-- administrator/principal permission that already gates creating a staff
-- account by hand in UserAccountsScreen).
create or replace function import_staff(p_rows jsonb)
returns table (row_index int, staff_no text, accepted boolean, error text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_idx int := 0;
  v_staff_id uuid;
begin
  if not has_permission(current_staff_id(), 'staff.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;
    begin
      insert into staff (staff_no, full_name, phone, email, joined_on)
      values (
        v_row ->> 'staff_no',
        v_row ->> 'full_name',
        v_row ->> 'phone',
        nullif(v_row ->> 'email', ''),
        nullif(v_row ->> 'joined_on', '')::date
      )
      returning id into v_staff_id;

      perform write_audit_log('insert', 'staff', v_staff_id, null, v_row);

      row_index := v_idx;
      staff_no := v_row ->> 'staff_no';
      accepted := true;
      error := null;
      return next;
    exception when others then
      row_index := v_idx;
      staff_no := v_row ->> 'staff_no';
      accepted := false;
      error := sqlerrm;
      return next;
    end;
  end loop;
end;
$$;
grant execute on function import_staff(jsonb) to authenticated;
