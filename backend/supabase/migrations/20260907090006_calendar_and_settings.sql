-- AdminSpec.md section 4.1 (remainder) — calendar overrides and settings.

create type day_type as enum ('school', 'holiday', 'half_day', 'exam', 'closure');

create table calendar_days (
  id            uuid primary key default gen_random_uuid(),
  on_date       date not null unique,
  day_type      day_type not null,
  label         text,
  created_by    uuid references staff,
  created_at    timestamptz not null default now()
);
alter table calendar_days enable row level security;
-- Only overrides are stored. Absence of a row means "derive from term + working days".

create table school_settings (
  id                       boolean primary key default true check (id),
  school_name              text not null,
  timezone                 text not null default 'Asia/Colombo',
  working_weekdays         smallint[] not null default '{1,2,3,4,5}',  -- ISO: 1=Mon
  day_starts_at            time not null default '07:30',
  day_ends_at              time not null default '13:30',
  attendance_due_at        time not null default '08:30',
  attendance_edit_minutes  smallint not null default 60,
  staff_late_after         time not null default '07:45',
  risk_consecutive_days    smallint not null default 3,
  risk_attendance_pct      numeric(5,2) not null default 80.00
);
alter table school_settings enable row level security;
