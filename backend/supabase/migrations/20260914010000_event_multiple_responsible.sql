-- Events could only name a single "responsible" staff member (events.responsible_id),
-- but real events often have more than one owner (e.g. co-organizers for Sports Day).
-- Replace the single FK column with a join table so an event can have zero, one, or
-- several responsible staff.
-- Guarded with IF NOT EXISTS / IF EXISTS throughout: this migration's objects were
-- already created by hand against the hosted DB in an earlier session while building
-- this feature, before it was captured here as a formal migration file. Re-running it
-- must be a safe no-op for whatever's already in place.
create table if not exists event_responsible_staff (
  event_id  uuid not null references events on delete cascade,
  staff_id  uuid not null references staff,
  primary key (event_id, staff_id)
);
alter table event_responsible_staff enable row level security;

drop policy if exists read_event_responsible_staff on event_responsible_staff;
create policy read_event_responsible_staff on event_responsible_staff for select
  using (current_staff_id() is not null);
drop policy if exists write_event_responsible_staff on event_responsible_staff;
create policy write_event_responsible_staff on event_responsible_staff for all
  using (has_permission(current_staff_id(), 'event.manage'))
  with check (has_permission(current_staff_id(), 'event.manage'));

do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'events' and column_name = 'responsible_id') then
    insert into event_responsible_staff (event_id, staff_id)
    select id, responsible_id from events where responsible_id is not null
    on conflict (event_id, staff_id) do nothing;
  end if;
end;
$$;

-- complete_event(): "or one of the event's responsible staff" now checks
-- membership in event_responsible_staff instead of a single-column equality.
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
  v_is_responsible boolean;
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

  select exists(
    select 1 from event_responsible_staff where event_id = p_event_id and staff_id = v_staff_id
  ) into v_is_responsible;

  if not (has_permission(v_staff_id, 'event.manage') or v_is_responsible) then
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

-- job_event_reminders() (20260907180001_events_diary.sql, updated for leadership
-- in 20260914000000): now notifies every responsible staff member instead of
-- just one, still alongside principal/vice_principal, still deduplicated, still
-- falling back to all active staff when no one is responsible.
create or replace function job_event_reminders() returns void
language plpgsql as $$
declare
  r record;
  v_recipient uuid;
begin
  if not is_school_day(current_date) then return; end if;

  for r in
    select e.id, e.title, e.starts_on
    from events e
    where e.starts_on - current_date = any(e.reminder_days)
  loop
    for v_recipient in
      select staff_id from event_responsible_staff where event_id = r.id
      union
      select sr.staff_id from staff_roles sr
      join roles ro on ro.id = sr.role_id
      where ro.key in ('principal', 'vice_principal') and sr.revoked_at is null
      union
      select s.id from staff s
      where not exists (select 1 from event_responsible_staff where event_id = r.id)
        and s.status = 'active'
    loop
      insert into notifications (staff_id, type, title, body, payload)
      values (v_recipient, 'event.reminder', 'Upcoming: ' || r.title,
              format('%s is on %s.', r.title, r.starts_on), jsonb_build_object('event_id', r.id));
    end loop;
  end loop;
end;
$$;

alter table events drop column if exists responsible_id;
