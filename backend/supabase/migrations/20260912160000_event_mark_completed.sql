-- "principal, admin or the assigned responsible staff can mark the event as
-- completed, on or after the event's schedule — and doing so automatically
-- adds a school diary entry for it." completed_at/completed_by track the
-- state directly on events; complete_event() is the only way either gets
-- set (write_events/update_events never grants a plain client UPDATE to
-- anyone but an event.manage holder, which the responsible staff member
-- often isn't), same one-RPC-does-the-whole-transaction shape as
-- assign_cover().
alter table events add column completed_at timestamptz;
alter table events add column completed_by uuid references staff;

-- Responsible staff need to call complete_event() without holding
-- event.manage themselves (most staff don't — see 003_role_permissions.sql),
-- so the check is inlined in the function body rather than left to
-- write_events, which stays exactly as narrow as it was.
create or replace function complete_event(p_event_id uuid) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id uuid := current_staff_id();
  v_event events%rowtype;
  v_effective_date date;
  v_diary_id uuid;
begin
  if v_staff_id is null then
    raise exception 'no_staff_record' using errcode = 'P0001';
  end if;

  select * into v_event from events where id = p_event_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_event.completed_at is not null then
    raise exception 'This event has already been marked completed.' using errcode = 'P0003';
  end if;

  if not (has_permission(v_staff_id, 'event.manage') or v_event.responsible_id = v_staff_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- A multi-day event (ends_on set) isn't over until its last day.
  v_effective_date := coalesce(v_event.ends_on, v_event.starts_on);
  if current_date < v_effective_date then
    raise exception 'This event can only be marked completed on or after its scheduled date.' using errcode = 'P0004';
  end if;

  update events set completed_at = now(), completed_by = v_staff_id where id = p_event_id;

  insert into diary_entries (on_date, title, body, event_id, author_id)
  values (v_event.starts_on, v_event.title, v_event.description, p_event_id, v_staff_id)
  returning id into v_diary_id;

  perform write_audit_log('update', 'events', p_event_id,
    jsonb_build_object('completed_at', null),
    jsonb_build_object('completed_at', now(), 'completed_by', v_staff_id, 'diary_entry_id', v_diary_id));

  return v_diary_id;
end;
$$;
grant execute on function complete_event(uuid) to authenticated;
