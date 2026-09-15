-- Follow-up to 20260916010000_promote_students.sql, split out only because
-- Postgres won't let the 'graduated' enum value added there be used until
-- that transaction has committed (55P04) — this migration is the first one
-- allowed to reference it.
--
-- promote_students() is the bulk write: the client resolves the whole
-- mapping (default "same section, next grade" plus any per-class/per-student
-- overrides, computed from grades.number) and sends the fully-resolved list
-- of {student_id, class_id} pairs, mirroring set_student_class()'s single-
-- permission-check pattern rather than re-deriving grade order in SQL.
-- Destination classes must already exist by the time this runs — created
-- client-side via the existing addClass()/staff.manage path, same as every
-- other class — this function only ever touches students/student_enrolments,
-- so it stays gated on student.edit alone like set_student_class() and
-- set_student_status() before it.
--
-- Idempotent by design: promoting ahead of the actual year-end (e.g. in
-- November while the current year still runs to December) is meant to be
-- safe to run early and re-run later as stragglers are added — a student
-- already enrolled in the target year, or already graduated, is skipped
-- rather than erroring, so a partial or repeated run never double-applies.
create or replace function promote_students(
  p_target_year_id uuid,
  p_promotions jsonb,   -- [{"student_id": uuid, "class_id": uuid}, ...]
  p_graduations jsonb   -- [student_id, ...]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_student_id uuid;
  v_class_id uuid;
  v_promoted int := 0;
  v_already_enrolled int := 0;
  v_graduated int := 0;
  v_already_graduated int := 0;
begin
  if not has_permission(current_staff_id(), 'student.edit') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from academic_years where id = p_target_year_id) then
    raise exception 'target_year_not_found' using errcode = 'P0002';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_promotions, '[]'::jsonb))
  loop
    v_student_id := (v_item->>'student_id')::uuid;
    v_class_id := (v_item->>'class_id')::uuid;

    if exists (select 1 from student_enrolments where student_id = v_student_id and academic_year_id = p_target_year_id) then
      v_already_enrolled := v_already_enrolled + 1;
      continue;
    end if;

    insert into student_enrolments (student_id, class_id, academic_year_id)
    values (v_student_id, v_class_id, p_target_year_id);

    perform write_audit_log('insert', 'student_enrolments', v_student_id, null,
      jsonb_build_object('class_id', v_class_id, 'academic_year_id', p_target_year_id, 'via', 'promotion'));
    v_promoted := v_promoted + 1;
  end loop;

  for v_student_id in select (jsonb_array_elements_text(coalesce(p_graduations, '[]'::jsonb)))::uuid
  loop
    if (select status from students where id = v_student_id) = 'graduated' then
      v_already_graduated := v_already_graduated + 1;
      continue;
    end if;

    update students set status = 'graduated', updated_at = now() where id = v_student_id;

    perform write_audit_log('update', 'students', v_student_id,
      jsonb_build_object('status', 'active'), jsonb_build_object('status', 'graduated'), 'promoted at year rollover');
    v_graduated := v_graduated + 1;
  end loop;

  return jsonb_build_object(
    'promoted', v_promoted,
    'already_enrolled', v_already_enrolled,
    'graduated', v_graduated,
    'already_graduated', v_already_graduated
  );
end;
$$;
grant execute on function promote_students(uuid, jsonb, jsonb) to authenticated;

-- Both queries below found a student's *current-year* class via NOT EXISTS
-- rather than joining the current year's roster, so a graduated student
-- (correctly, no enrolment in the new current year) would otherwise pass
-- the "not enrolled" half of the check with a status still not equal to
-- 'left' and wrongly show up as "unassigned" — needing a class assigned —
-- on the Set Class screen.
create or replace function list_unassigned_students()
returns table (id uuid, admission_no text, full_name text, preferred_name text, photo_path text, status person_status, has_attendance boolean)
language sql
stable
as $$
  select s.id, s.admission_no, s.full_name, s.preferred_name, s.photo_path, s.status,
    exists (select 1 from student_attendance sa where sa.student_id = s.id) as has_attendance
  from students s
  where s.status not in ('left', 'graduated')
    and not exists (
      select 1 from student_enrolments se
      where se.student_id = s.id
        and se.academic_year_id = (select id from academic_years where is_current)
    )
  order by s.full_name;
$$;
grant execute on function list_unassigned_students() to authenticated;
