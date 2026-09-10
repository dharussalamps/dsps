-- Business rule (not in AdminSpec.md's original role table, section 4.1):
-- creating a student record — whether one at a time (AddStudentScreen) or
-- via CSV (ImportStudentsSection) — is restricted to the principal and
-- administrator roles specifically, narrower than 'student.edit' itself
-- (which vice_principal also holds, for editing *existing* student
-- records — that stays unchanged). Since role_permissions is a fixed
-- per-role seed rather than something staff.manage lets an admin
-- customize, "only these two roles" is expressed as a role check, not a
-- new permission key — permissions.ts / the 32-key list in
-- seed/002_permissions.sql is otherwise unaffected.
create or replace function current_staff_has_role(p_role_keys text[])
returns boolean language sql stable as $$
  select exists (
    select 1
    from staff_roles sr
    join roles r on r.id = sr.role_id
    where sr.staff_id = current_staff_id()
      and sr.revoked_at is null
      and r.key = any(p_role_keys)
  );
$$;
grant execute on function current_staff_has_role(text[]) to authenticated;

create or replace function import_students(p_rows jsonb)
returns table (row_index int, admission_no text, accepted boolean, error text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_idx int := 0;
  v_student_id uuid;
  v_guardian_id uuid;
  v_class_id uuid;
  v_year_id uuid;
begin
  if not (has_permission(current_staff_id(), 'student.edit') and current_staff_has_role(array['principal', 'administrator'])) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select id into v_year_id from academic_years where is_current;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;
    begin
      insert into students (admission_no, full_name, preferred_name, date_of_birth)
      values (
        v_row ->> 'admission_no',
        v_row ->> 'full_name',
        nullif(v_row ->> 'preferred_name', ''),
        nullif(v_row ->> 'date_of_birth', '')::date
      )
      returning id into v_student_id;

      if v_row ->> 'class_name' is not null and v_year_id is not null then
        select id into v_class_id from classes where name = v_row ->> 'class_name' and academic_year_id = v_year_id;
        if v_class_id is not null then
          insert into student_enrolments (student_id, class_id, academic_year_id)
          values (v_student_id, v_class_id, v_year_id);
        end if;
      end if;

      if v_row ->> 'guardian_name' is not null and v_row ->> 'guardian_phone' is not null then
        insert into guardians (full_name, relationship, phone_primary)
        values (v_row ->> 'guardian_name', v_row ->> 'guardian_relationship', v_row ->> 'guardian_phone')
        returning id into v_guardian_id;

        insert into student_guardians (student_id, guardian_id, is_primary)
        values (v_student_id, v_guardian_id, true);
      end if;

      perform write_audit_log('insert', 'students', v_student_id, null, v_row);

      row_index := v_idx;
      admission_no := v_row ->> 'admission_no';
      accepted := true;
      error := null;
      return next;
    exception when others then
      row_index := v_idx;
      admission_no := v_row ->> 'admission_no';
      accepted := false;
      error := sqlerrm;
      return next;
    end;
  end loop;
end;
$$;
grant execute on function import_students(jsonb) to authenticated;
