-- Carries the new students.gender column (20260910130000) through
-- import_students, the single write path both AddStudentScreen and the CSV
-- import use to create a student.
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

    if exists (select 1 from students where admission_no = v_row ->> 'admission_no') then
      row_index := v_idx;
      admission_no := v_row ->> 'admission_no';
      accepted := false;
      error := 'duplicate_admission_no';
      return next;
      continue;
    end if;

    begin
      v_student_id := null;
      v_guardian_id := null;

      insert into students (admission_no, full_name, preferred_name, date_of_birth, gender)
      values (
        v_row ->> 'admission_no',
        v_row ->> 'full_name',
        nullif(v_row ->> 'preferred_name', ''),
        nullif(v_row ->> 'date_of_birth', '')::date,
        nullif(v_row ->> 'gender', '')
      )
      returning id into v_student_id;

      if v_row ->> 'class_name' is not null and v_year_id is not null then
        select id into v_class_id from classes where name = v_row ->> 'class_name' and academic_year_id = v_year_id;
        if v_class_id is not null then
          insert into student_enrolments (student_id, class_id, academic_year_id)
          values (v_student_id, v_class_id, v_year_id);
        end if;
      end if;

      if nullif(v_row ->> 'guardian_nic_number', '') is not null then
        select id into v_guardian_id from guardians where nic_number = v_row ->> 'guardian_nic_number';
      end if;

      if v_guardian_id is null and v_row ->> 'guardian_name' is not null and v_row ->> 'guardian_phone' is not null then
        insert into guardians (full_name, relationship, phone_primary, nic_number)
        values (
          v_row ->> 'guardian_name',
          v_row ->> 'guardian_relationship',
          v_row ->> 'guardian_phone',
          nullif(v_row ->> 'guardian_nic_number', '')
        )
        returning id into v_guardian_id;
      end if;

      if v_guardian_id is not null then
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
