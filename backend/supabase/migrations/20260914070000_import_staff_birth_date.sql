-- Carries staff.birth_date (20260909020000_staff_birth_date) through import_staff — it was
-- added after the CSV import RPC was written and never wired in, so a bulk import had no way
-- to set it even though the manual create/edit forms both collect it. Same treatment address
-- got in 20260910160000_import_staff_address.sql.
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
      insert into staff (staff_no, full_name, phone, email, joined_on, address, birth_date)
      values (
        v_row ->> 'staff_no',
        v_row ->> 'full_name',
        v_row ->> 'phone',
        nullif(v_row ->> 'email', ''),
        nullif(v_row ->> 'joined_on', '')::date,
        nullif(v_row ->> 'address', ''),
        nullif(v_row ->> 'birth_date', '')::date
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
