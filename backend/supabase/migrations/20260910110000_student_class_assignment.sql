-- A student created without a class (AddStudentScreen's class picker is
-- optional) had no way to get one afterwards, and no way back to unassigned
-- once enrolled either — student_enrolments has no client write policy at
-- all (see 20260907100002_rls_policies_phase1.sql's own comment: "changes
-- via promotion/import, which runs with the service role"). Both actions
-- are gated on 'student.edit' alone, same as set_student_status() — this is
-- an edit to an existing student's record, not the narrower principal/
-- administrator-only creation path in student_create_admin_principal_only.sql.

create or replace function set_student_class(p_student_id uuid, p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year_id uuid;
  v_existing uuid;
begin
  if not has_permission(current_staff_id(), 'student.edit') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select id into v_year_id from academic_years where is_current;
  if v_year_id is null then
    raise exception 'no_current_academic_year' using errcode = 'P0002';
  end if;

  select id into v_existing from student_enrolments
    where student_id = p_student_id and academic_year_id = v_year_id;
  if v_existing is not null then
    raise exception 'already_enrolled' using errcode = '23505';
  end if;

  insert into student_enrolments (student_id, class_id, academic_year_id)
  values (p_student_id, p_class_id, v_year_id);

  perform write_audit_log('insert', 'student_enrolments', p_student_id, null, jsonb_build_object('class_id', p_class_id));
end;
$$;
grant execute on function set_student_class(uuid, uuid) to authenticated;

create or replace function remove_student_from_class(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year_id uuid;
  v_class_id uuid;
begin
  if not has_permission(current_staff_id(), 'student.edit') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select id into v_year_id from academic_years where is_current;
  if v_year_id is null then
    raise exception 'no_current_academic_year' using errcode = 'P0002';
  end if;

  select class_id into v_class_id from student_enrolments
    where student_id = p_student_id and academic_year_id = v_year_id;
  if v_class_id is null then
    raise exception 'not_enrolled' using errcode = 'P0002';
  end if;

  delete from student_enrolments where student_id = p_student_id and academic_year_id = v_year_id;

  perform write_audit_log('delete', 'student_enrolments', p_student_id, jsonb_build_object('class_id', v_class_id), null);
end;
$$;
grant execute on function remove_student_from_class(uuid) to authenticated;

-- Lists students with no enrolment in the current academic year, for the
-- "Set class" screen. Deliberately plain SQL (not security definer) so it
-- runs with the caller's own privileges — read_students' existing RLS
-- policy applies exactly as it would to a direct select, via
-- student_current_class_id() resolving to null for these students (see
-- that function's own comment: school/self-scoped grants still see a null
-- class_id; grade/class-scoped ones correctly don't, having no class to be
-- scoped by).
create or replace function list_unassigned_students()
returns table (id uuid, admission_no text, full_name text, preferred_name text, photo_path text, status person_status)
language sql
stable
as $$
  select s.id, s.admission_no, s.full_name, s.preferred_name, s.photo_path, s.status
  from students s
  where s.status <> 'left'
    and not exists (
      select 1 from student_enrolments se
      where se.student_id = s.id
        and se.academic_year_id = (select id from academic_years where is_current)
    )
  order by s.full_name;
$$;
grant execute on function list_unassigned_students() to authenticated;
