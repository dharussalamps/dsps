-- FR-CAL-06: "the principal may declare an emergency closure for the
-- current or a future day from the home screen. This cancels that day's
-- attendance obligations, removes the day from attendance calculations,
-- and notifies all staff." A plain upsert into calendar_days already made
-- is_school_day() false for that date (which is what actually cancels
-- attendance obligations and excludes it from summaries), but nothing ever
-- notified staff, and there was no Home entry point to reach even the
-- upsert. This is the AdminSpec.md section 8 `POST /declare-closure`
-- behaviour, as an RPC (same reasoning as assign_cover: a single
-- permission-checked write with no need for a Deno layer).
create or replace function declare_closure(p_date date, p_label text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff record;
begin
  if not has_permission(current_staff_id(), 'calendar.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into calendar_days (on_date, day_type, label, created_by)
  values (p_date, 'closure', p_label, current_staff_id())
  on conflict (on_date) do update set day_type = 'closure', label = excluded.label;

  perform write_audit_log('update', 'calendar_days', null,
    null, jsonb_build_object('on_date', p_date, 'day_type', 'closure', 'label', p_label));

  for v_staff in select id from staff where status = 'active' loop
    insert into notifications (staff_id, type, title, body, payload)
    values (
      v_staff.id, 'calendar.closure', 'School closed',
      format('%s has been declared a closure day%s.', p_date, case when p_label is not null then ': ' || p_label else '' end),
      jsonb_build_object('on_date', p_date)
    );
  end loop;
end;
$$;
grant execute on function declare_closure(date, text) to authenticated;

-- Home's "Needs attention" block (section 10) lists "uncovered classes" —
-- a class whose own teacher is absent or on approved leave today with no
-- active cover_assignment picking it up. leave approval already forces a
-- cover decision (FR-LVE-06), but a teacher who's simply marked absent (no
-- leave request at all) can leave a class with nobody accountable for it,
-- which is exactly the gap this surfaces.
create or replace function classes_needing_cover(p_on_date date default current_date)
returns table(class_id uuid, class_name text, teacher_id uuid, teacher_name text, teacher_status text)
language sql
stable
as $$
  select c.id, c.name, c.class_teacher_id, st.full_name, sa.status::text
  from classes c
  join staff st on st.id = c.class_teacher_id
  join academic_years ay on ay.id = c.academic_year_id and ay.is_current
  join staff_attendance sa on sa.staff_id = c.class_teacher_id and sa.on_date = p_on_date
  where sa.status in ('absent', 'on_leave')
    and has_permission(current_staff_id(), 'cover.assign', c.id)
    and not exists (
      select 1 from cover_assignments ca
      where ca.class_id = c.id and p_on_date between ca.starts_on and ca.ends_on
    );
$$;
grant execute on function classes_needing_cover(date) to authenticated;
