-- AdminSpec.md section 4.4 (remainder) — scope and cover assignments.

create type scope_type as enum ('school', 'grade', 'class', 'self');

create table staff_roles (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff on delete cascade,
  role_id       uuid not null references roles,
  scope_type    scope_type not null,
  scope_id      uuid,                  -- null when scope_type = 'school' or 'self'
  granted_by    uuid references staff,
  granted_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  check ((scope_type in ('school', 'self')) = (scope_id is null))
);
alter table staff_roles enable row level security;

create table cover_assignments (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references classes,
  staff_id      uuid not null references staff,
  starts_on     date not null,
  ends_on       date not null,
  reason        text,
  assigned_by   uuid not null references staff,
  created_at    timestamptz not null default now(),
  check (ends_on >= starts_on)
);
alter table cover_assignments enable row level security;
