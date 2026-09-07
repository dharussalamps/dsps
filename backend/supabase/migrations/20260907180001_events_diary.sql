-- AdminSpec.md section 4.9 — events, diary_entries. Build task 19.

create table events (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  description       text,
  category          text,
  starts_on         date not null,
  ends_on           date,
  location          text,
  responsible_id    uuid references staff,
  reminder_days     smallint[] not null default '{7,1}',
  academic_year_id  uuid references academic_years,
  created_by        uuid not null references staff
);
alter table events enable row level security;

-- Events are school-wide calendar info — readable by any signed-in staff.
create policy read_events on events for select using (current_staff_id() is not null);
create policy write_events on events for all
  using (has_permission(current_staff_id(), 'event.manage'))
  with check (has_permission(current_staff_id(), 'event.manage') and created_by = current_staff_id());

create table diary_entries (
  id            uuid primary key default gen_random_uuid(),
  on_date       date not null,
  title         text not null,
  body          text,
  photo_paths   text[],
  event_id      uuid references events,
  author_id     uuid not null references staff,
  created_at    timestamptz not null default now()
);
alter table diary_entries enable row level security;

create policy read_diary_entries on diary_entries for select using (current_staff_id() is not null);
create policy write_diary_entries on diary_entries for all
  using (has_permission(current_staff_id(), 'diary.manage'))
  with check (has_permission(current_staff_id(), 'diary.manage') and author_id = current_staff_id());

-- section 7: event_reminders, daily 06:00. "For each event, for each value
-- in reminder_days, notify the audience if today matches."
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
    -- "the audience" isn't specified beyond this — the event's
    -- responsible staff member if set, plus all_staff-equivalent (every
    -- active staff member) otherwise, matching how an all-school calendar
    -- item would normally be broadcast.
    if r.responsible_id is not null then
      insert into notifications (staff_id, type, title, body, payload)
      values (r.responsible_id, 'event.reminder', 'Upcoming: ' || r.title,
              format('%s is on %s.', r.title, r.starts_on), jsonb_build_object('event_id', r.id));
    else
      for v_recipient in select id from staff where status = 'active' loop
        insert into notifications (staff_id, type, title, body, payload)
        values (v_recipient, 'event.reminder', 'Upcoming: ' || r.title,
                format('%s is on %s.', r.title, r.starts_on), jsonb_build_object('event_id', r.id));
      end loop;
    end if;
  end loop;
end;
$$;
select cron.schedule('event_reminders', '0 6 * * *', 'select job_event_reminders()');
