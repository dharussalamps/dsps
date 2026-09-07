-- AdminSpec.md section 8, POST /import-records — build task 5. "Never
-- partially commits" and "returns a reconciliation report of accepted and
-- rejected rows" together mean: one call either succeeds outright (and
-- returns which of its rows were accepted vs rejected) or, if it crashes
-- or is cancelled mid-way, leaves nothing behind at all — not "some rows
-- silently missing". A plain loop of inserts can't do this: one failing
-- row would either abort the whole transaction (no differentiated report)
-- or need a bare loop with no isolation (a later row's failure could
-- still leave earlier rows uncommitted if the function itself errors
-- out). PL/pgSQL's BEGIN/EXCEPTION block creates an implicit SAVEPOINT
-- per iteration, so each row's insert can fail and roll back to just its
-- own savepoint while every other row's row stays committed within the
-- one overall call.
--
-- Scope note (see docs/AdminSpec.md section 17): implemented for students
-- (+ their guardian + enrolment) only. Guardians/staff/classes import
-- would follow the identical row-by-row-savepoint shape but aren't built
-- in this pass — the goal here was one working, correct example of the
-- pattern rather than four shallow ones.
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
  if not has_permission(current_staff_id(), 'student.edit') then
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
