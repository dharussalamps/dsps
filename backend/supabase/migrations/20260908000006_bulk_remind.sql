-- FR-ATT-12: "the principal or a sectional head may remind the teachers of
-- all unmarked classes in their scope in one action." remind_unmarked_class
-- (20260907110007) only ever reminded one class at a time — the board's
-- "Remind" button, not the bulk action FR-ATT-12 and section 10's Home
-- "Section status" / "School pulse" blocks both describe. Reuses
-- v_class_marking_status for "classes in scope, unmarked" (same query the
-- board itself renders from) rather than re-deriving scope here.
create or replace function remind_unmarked_classes_bulk(p_on_date date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v_recipient uuid;
  v_reminded int := 0;
begin
  for c in
    select class_id, class_name
    from v_class_marking_status(p_on_date)
    where submitted = false
      and has_permission(current_staff_id(), 'attendance.remind', class_id)
  loop
    -- One class's failure (e.g. it was just submitted a moment ago, or the
    -- rate limit already fired from a recent per-class remind) must not
    -- abort the rest of the batch — same BEGIN/EXCEPTION-per-row pattern
    -- import_students() uses (build task 5) for exactly this reason.
    begin
      if not check_rate_limit('remind_unmarked_class:' || c.class_id::text, 1, interval '2 minutes') then
        continue;
      end if;

      select coalesce(
        (select ca.staff_id from cover_assignments ca
         where ca.class_id = c.class_id and current_date between ca.starts_on and ca.ends_on
         order by ca.created_at desc limit 1),
        (select class_teacher_id from classes where id = c.class_id)
      ) into v_recipient;

      if v_recipient is not null then
        insert into notifications (staff_id, type, title, body, payload)
        values (
          v_recipient, 'attendance.remind_unmarked', 'Attendance not marked',
          format('%s has not marked attendance yet today.', c.class_name),
          jsonb_build_object('class_id', c.class_id, 'on_date', p_on_date, 'manual', true)
        );
        v_reminded := v_reminded + 1;
      end if;
    exception when others then
      continue;
    end;
  end loop;

  return v_reminded;
end;
$$;
grant execute on function remind_unmarked_classes_bulk(date) to authenticated;
