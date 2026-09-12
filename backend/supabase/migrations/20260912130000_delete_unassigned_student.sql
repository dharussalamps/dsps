-- Set class screen: give admins a way to permanently remove a student who
-- was added by mistake or will never be enrolled, instead of leaving them
-- stuck in the unassigned list forever (the only other lifecycle action,
-- set_student_status('left'), keeps the record — see 20260908000001_audit_
-- triggers_and_fixes.sql). A hard delete is irreversible and, via students'
-- on delete cascade FKs, would silently wipe any attendance/marks/
-- achievement history along with it — so unlike every other student write,
-- this one refuses outright rather than just confirming, whenever the
-- student is currently in a class or has any attendance recorded. Gated the
-- same as creation (principal/administrator only, current_staff_has_role
-- from 20260910100000_student_create_admin_principal_only.sql) since
-- destroying a record is at least as sensitive as making one.

create or replace function delete_student(p_student_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student students;
  v_has_class boolean;
  v_has_attendance boolean;
begin
  if not (has_permission(current_staff_id(), 'student.edit') and current_staff_has_role(array['principal', 'administrator'])) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_student from students where id = p_student_id;
  if v_student.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from student_enrolments se
    join academic_years ay on ay.id = se.academic_year_id
    where se.student_id = p_student_id and ay.is_current
  ) into v_has_class;
  if v_has_class then
    raise exception 'This student is assigned to a class. Remove them from the class before deleting.' using errcode = 'P0001';
  end if;

  select exists (select 1 from student_attendance where student_id = p_student_id) into v_has_attendance;
  if v_has_attendance then
    raise exception 'This student has attendance records and cannot be deleted.' using errcode = 'P0001';
  end if;

  perform write_audit_log('delete', 'students', p_student_id, to_jsonb(v_student), null, p_reason);

  delete from students where id = p_student_id;
end;
$$;
grant execute on function delete_student(uuid, text) to authenticated;
