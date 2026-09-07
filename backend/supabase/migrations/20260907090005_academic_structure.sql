-- AdminSpec.md section 4.1 (calendar tables that structure depends on) and
-- section 4.2 — Structure. calendar_days and school_settings follow in the
-- next migration since they are not depended on by anything here.

create table academic_years (
  id            uuid primary key default gen_random_uuid(),
  label         text not null unique,           -- '2026'
  starts_on     date not null,
  ends_on       date not null,
  is_current    boolean not null default false,
  check (ends_on > starts_on)
);
alter table academic_years enable row level security;

create unique index one_current_year on academic_years (is_current) where is_current;

create table terms (
  id                 uuid primary key default gen_random_uuid(),
  academic_year_id   uuid not null references academic_years on delete cascade,
  name               text not null,             -- 'Term 1'
  sequence           smallint not null,
  starts_on          date not null,
  ends_on            date not null,
  check (ends_on >= starts_on),
  unique (academic_year_id, sequence)
);
alter table terms enable row level security;

-- terms within a year must not overlap: enforced by exclusion constraint
alter table terms add constraint terms_no_overlap
  exclude using gist (
    academic_year_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  );

create table grades (
  id        uuid primary key default gen_random_uuid(),
  number    smallint not null unique,       -- 1..5
  name      text not null
);
alter table grades enable row level security;

create table classes (
  id                uuid primary key default gen_random_uuid(),
  grade_id          uuid not null references grades,
  academic_year_id  uuid not null references academic_years,
  name              text not null,          -- '4B'
  class_teacher_id  uuid references staff,
  unique (academic_year_id, name)
);
alter table classes enable row level security;

create table subjects (
  id       uuid primary key default gen_random_uuid(),
  name     text not null,
  code     text unique
);
alter table subjects enable row level security;

create table grade_subjects (
  grade_id    uuid references grades,
  subject_id  uuid references subjects,
  primary key (grade_id, subject_id)
);
alter table grade_subjects enable row level security;

create table class_subject_teachers (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references classes on delete cascade,
  subject_id   uuid not null references subjects,
  staff_id     uuid not null references staff,
  unique (class_id, subject_id)
);
alter table class_subject_teachers enable row level security;

create table student_enrolments (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references students on delete cascade,
  class_id          uuid not null references classes,
  academic_year_id  uuid not null references academic_years,
  roll_no           text,
  unique (student_id, academic_year_id)
);
alter table student_enrolments enable row level security;
-- A student's class is always read through the enrolment for the current year.
-- Promotion inserts a new row; it never overwrites the previous one.
