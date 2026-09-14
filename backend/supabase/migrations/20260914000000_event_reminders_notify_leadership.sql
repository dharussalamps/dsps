-- Event reminders (job_event_reminders(), 20260907180001_events_diary.sql) only notified the
-- event's responsible staff member when one was set, leaving the principal/vice_principal blind
-- to events they didn't personally assign. Leadership should always see what's coming regardless
-- of who's directly responsible, on the same reminder_days schedule as everyone else.
create or replace function job_event_reminders() returns void
language plpgsql as $$
declare
  r record;
  v_recipient uuid;
begin
  if not is_school_day(current_date) then return; end if;

  for r in
    select e.id, e.title, e.starts_on, e.responsible_id
    from events e
    where e.starts_on - current_date = any(e.reminder_days)
  loop
    -- Recipients: the responsible staff member (if any) plus every
    -- principal/vice_principal, deduplicated; falls back to all active
    -- staff (matching the previous behavior) when no one is responsible.
    for v_recipient in
      select r.responsible_id where r.responsible_id is not null
      union
      select sr.staff_id from staff_roles sr
      join roles ro on ro.id = sr.role_id
      where ro.key in ('principal', 'vice_principal') and sr.revoked_at is null
      union
      select s.id from staff s where r.responsible_id is null and s.status = 'active'
    loop
      insert into notifications (staff_id, type, title, body, payload)
      values (v_recipient, 'event.reminder', 'Upcoming: ' || r.title,
              format('%s is on %s.', r.title, r.starts_on), jsonb_build_object('event_id', r.id));
    end loop;
  end loop;
end;
$$;
