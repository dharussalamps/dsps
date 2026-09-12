-- FR-COV-01 companion: whoever can assign cover for a class (cover.assign)
-- can also remove one already on the books — e.g. plans changed, or it was
-- assigned in error. Mirrors assign_cover()'s shape (backend/supabase/
-- migrations/20260907120005_assign_cover.sql): permission check scoped to
-- the assignment's class, an audit_log row, and a notification to the
-- teacher who's losing the assignment — cover_assignments' own
-- write_cover_assignments RLS policy would already allow a plain client
-- DELETE, but that would skip both of those, unlike every other
-- class-scoped mutation in this schema.
create or replace function remove_cover_assignment(
  p_cover_assignment_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
  v_staff_id uuid;
  v_starts_on date;
  v_ends_on date;
  v_class_name text;
begin
  select class_id, staff_id, starts_on, ends_on
    into v_class_id, v_staff_id, v_starts_on, v_ends_on
  from cover_assignments
  where id = p_cover_assignment_id;

  if v_class_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if not has_permission(current_staff_id(), 'cover.assign', v_class_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select name into v_class_name from classes where id = v_class_id;

  delete from cover_assignments where id = p_cover_assignment_id;

  perform write_audit_log('delete', 'cover_assignments', p_cover_assignment_id,
    jsonb_build_object('class_id', v_class_id, 'staff_id', v_staff_id, 'starts_on', v_starts_on, 'ends_on', v_ends_on), null);

  insert into notifications (staff_id, type, title, body, payload)
  values (v_staff_id, 'cover.removed', 'Your cover assignment was removed',
    format('Your cover for %s from %s to %s has been cancelled.', v_class_name, v_starts_on, v_ends_on),
    jsonb_build_object('class_id', v_class_id));
end;
$$;
grant execute on function remove_cover_assignment(uuid) to authenticated;
