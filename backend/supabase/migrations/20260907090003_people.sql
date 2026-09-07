-- AdminSpec.md section 4.3 — People.
-- staff is created here (ahead of its section order) because classes,
-- calendar_days, class_subject_teachers, staff_roles, cover_assignments
-- and audit_log all reference it, and every table must have RLS enabled
-- from the moment it exists.

create type person_status as enum ('active', 'inactive', 'left');

create table students (
  id                uuid primary key default gen_random_uuid(),
  admission_no      text not null unique,
  full_name         text not null,
  preferred_name    text,
  date_of_birth     date,
  photo_path        text,
  photo_consent     boolean not null default false,
  status            person_status not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table students enable row level security;

create trigger students_set_updated_at
  before update on students
  for each row execute function set_updated_at();

create table guardians (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  relationship   text,                       -- 'father','mother','grandmother'
  phone_primary  text not null,
  phone_alt      text,
  address        text,
  status         person_status not null default 'active'
);
alter table guardians enable row level security;

create table student_guardians (
  student_id   uuid references students on delete cascade,
  guardian_id  uuid references guardians on delete cascade,
  is_primary   boolean not null default false,
  primary key (student_id, guardian_id)
);
alter table student_guardians enable row level security;

create unique index one_primary_guardian
  on student_guardians (student_id) where is_primary;

create table staff (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users (id) on delete set null,
  staff_no      text not null unique,
  full_name     text not null,
  phone         text not null,
  email         text,
  joined_on     date,
  status        person_status not null default 'active',
  created_at    timestamptz not null default now()
);
alter table staff enable row level security;
