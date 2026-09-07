-- AdminSpec.md section 4.10, devices + notifications only — pulled forward
-- because the scheduled jobs in build task 11 write notifications rows.
-- audit_log already exists (build task 2).

create table devices (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff on delete cascade,
  push_token    text not null unique,
  platform      text not null,
  last_seen_at  timestamptz not null default now()
);
alter table devices enable row level security;

create policy read_devices on devices for select using (staff_id = current_staff_id());
create policy write_devices on devices for all
  using (staff_id = current_staff_id())
  with check (staff_id = current_staff_id());

create table notifications (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff on delete cascade,
  type          text not null,
  title         text not null,
  body          text,
  payload       jsonb,
  sent_at       timestamptz,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
alter table notifications enable row level security;

create policy read_notifications on notifications for select using (staff_id = current_staff_id());
create policy mark_read_notifications on notifications for update
  using (staff_id = current_staff_id())
  with check (staff_id = current_staff_id());
-- No client insert policy: every row is written by a scheduled job or an
-- Edge Function using the service role (section 7) — a staff member can
-- read and mark-as-read their own notifications, never forge one.
