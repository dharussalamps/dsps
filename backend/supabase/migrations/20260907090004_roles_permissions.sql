-- AdminSpec.md section 4.4 (part 1) — Roles and permissions.
-- staff_roles and cover_assignments follow in a later migration since they
-- reference classes, which does not exist yet.

create table roles (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,   -- 'principal','sectional_head','class_teacher',
                                        -- 'administrator','staff','vice_principal'
  name         text not null,
  is_system    boolean not null default false
);
alter table roles enable row level security;

create table permissions (
  key          text primary key,       -- 'attendance.mark', 'leave.approve'
  description  text not null
);
alter table permissions enable row level security;

create table role_permissions (
  role_id         uuid references roles on delete cascade,
  permission_key  text references permissions on delete cascade,
  primary key (role_id, permission_key)
);
alter table role_permissions enable row level security;
