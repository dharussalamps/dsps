-- AdminSpec.md section 8, POST /assign-cover — standalone cover assignment
-- (not tied to a leave approval, which already creates its own via
-- approve_leave()). "Creates a cover assignment and notifies both
-- teachers."
--
-- Implemented as an RPC only, not also wrapped in an Edge Function.
-- section 8 lists 8 Edge Functions; this build gives each one a real
-- Postgres function (where the actual transaction and permission check
-- live, same as submit_attendance/approve_leave), but only wraps it in a
-- Deno Edge Function where that layer earns its keep — request validation
-- shared with an offline client (submit-attendance), or work Postgres
-- itself can't do (spreadsheet parsing, generating a signed export URL).
-- assign-cover is a single permission-checked transactional write with no
-- such need; calling the RPC directly from the client is the same
-- security posture with one fewer moving part. See docs/AdminSpec.md
-- section 17.
create or replace function assign_cover(
  p_class_id uuid,
  p_staff_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_class_name text;
  v_class_teacher_id uuid;
begin
  if not has_permission(current_staff_id(), 'cover.assign', p_class_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select name, class_teacher_id into v_class_name, v_class_teacher_id from classes where id = p_class_id;

  insert into cover_assignments (class_id, staff_id, starts_on, ends_on, reason, assigned_by)
  values (p_class_id, p_staff_id, p_starts_on, p_ends_on, p_reason, current_staff_id())
  returning id into v_id;

  perform write_audit_log('insert', 'cover_assignments', v_id, null,
    jsonb_build_object('class_id', p_class_id, 'staff_id', p_staff_id, 'starts_on', p_starts_on, 'ends_on', p_ends_on));

  insert into notifications (staff_id, type, title, body, payload)
  values (p_staff_id, 'cover.assigned', 'You have been assigned to cover a class',
    format('Covering %s from %s to %s.', v_class_name, p_starts_on, p_ends_on),
    jsonb_build_object('class_id', p_class_id, 'cover_assignment_id', v_id));

  if v_class_teacher_id is not null and v_class_teacher_id <> p_staff_id then
    insert into notifications (staff_id, type, title, body, payload)
    values (v_class_teacher_id, 'cover.assigned', 'Cover arranged for your class',
      format('%s will cover your class from %s to %s.', (select full_name from staff where id = p_staff_id), p_starts_on, p_ends_on),
      jsonb_build_object('class_id', p_class_id, 'cover_assignment_id', v_id));
  end if;

  return v_id;
end;
$$;
grant execute on function assign_cover(uuid, uuid, date, date, text) to authenticated;
