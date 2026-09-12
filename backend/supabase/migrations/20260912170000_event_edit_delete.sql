-- Editing: write_events's original `with check (... and created_by =
-- current_staff_id())` was written with INSERT in mind, but as a single
-- `for all` policy it also applied to UPDATE — and Postgres re-evaluates
-- WITH CHECK against the new row on every UPDATE, so it silently restricted
-- editing to the event's original creator even though any event.manage
-- holder (principal/vice_principal/administrator) was clearly meant to be
-- able to manage any event, matching how the rest of the app treats that
-- permission. Splitting into per-command policies fixes this: the
-- created_by requirement now applies only where it was meant to (INSERT).
drop policy if exists write_events on events;

create policy insert_events on events for insert
  with check (has_permission(current_staff_id(), 'event.manage') and created_by = current_staff_id());

create policy update_events on events for update
  using (has_permission(current_staff_id(), 'event.manage'))
  with check (has_permission(current_staff_id(), 'event.manage'));

-- Deleting: deliberately no DELETE policy here. "An event that has already
-- been saved to the diary — completed, or otherwise linked via a manual
-- diary entry — can't be deleted" is a cross-table check RLS can't express
-- on its own, so delete_event() below is the only path to delete an event;
-- leaving DELETE unpoliced (default-deny) stops a direct client .delete()
-- call from bypassing that check.
create or replace function delete_event(p_event_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id uuid := current_staff_id();
  v_has_diary boolean;
begin
  if v_staff_id is null then
    raise exception 'no_staff_record' using errcode = 'P0001';
  end if;

  if not has_permission(v_staff_id, 'event.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select exists(select 1 from diary_entries where event_id = p_event_id) into v_has_diary;
  if v_has_diary then
    raise exception 'This event has a diary entry and cannot be deleted.' using errcode = 'P0005';
  end if;

  delete from events where id = p_event_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform write_audit_log('delete', 'events', p_event_id, null, null);
end;
$$;
grant execute on function delete_event(uuid) to authenticated;
