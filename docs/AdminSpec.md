# School Admin App — AI Build Specification

**Companion to:** Software Requirements Specification v1.0
**Audience:** an AI coding agent, or a developer working with one
**Status:** authoritative for implementation

---

## 0. How to use this document

This document is written to be handed to an AI agent as the source of truth for building the system. It differs from the SRS in that it states decisions rather than describing intentions.

Rules for the agent:

1. **Do not invent scope.** If something is not in this document, it is not in the build. Ask rather than assume.
2. **Build in the order given in section 12.** Each task has a completion test. Do not begin a task until the previous one passes its test.
3. **Every rule in section 5 (permissions) and section 6 (derived logic) is enforced server-side.** Client-side hiding of controls is presentation, never protection.
4. **Where this document conflicts with the SRS, this document wins** on implementation detail; the SRS wins on intent.
5. **Open decisions are listed in section 15.** Where one blocks a task, implement the stated default and make it configurable.

---

## 1. Product summary

A mobile application used by the staff of a primary school of ~900 students (grades 1–5, ~30 classes) and ~35 staff. It replaces paper attendance registers and spreadsheet record-keeping.

The single most important flow: **a class teacher marks attendance for ~35 students in under 30 seconds, on a phone, possibly with no network.** Every other decision is subordinate to this one.

A parent-facing app is a later phase and is out of scope, except that the guardian data model must support it without change.

### Non-negotiables

| Rule | Reason |
|---|---|
| Attendance marking works fully offline | Classroom connectivity is unreliable; a lost marking session ends adoption |
| Roster defaults to all-present | Marking 35 students individually takes too long |
| Permissions are scoped data, not code branches | The school will invent new roles |
| Nothing scheduled runs on a non-school day | A holiday must not produce 900 absence records |
| Every write is audited | Attendance and marks are records of consequence |

---

## 2. Technology decisions

These are fixed. Do not substitute.

| Concern | Decision |
|---|---|
| Mobile client | React Native (Expo managed workflow) |
| Language | TypeScript, strict mode |
| Backend | Supabase — PostgreSQL, GoTrue auth, Row Level Security, Storage, Edge Functions, pg_cron |
| Local database (offline) | SQLite via `expo-sqlite`, wrapped in a sync queue |
| State | TanStack Query for server state; Zustand for local UI state |
| Navigation | React Navigation — bottom tabs + native stack |
| Forms | React Hook Form with Zod schemas shared between client and Edge Functions |
| Push | Expo Notifications over FCM and APNs |
| Dates | `date-fns` with `date-fns-tz`. Store `timestamptz`; school timezone in `school_settings` |
| Testing | Vitest for logic, React Native Testing Library for components, pgTAP for RLS policies |
| Migrations | Supabase CLI migrations, versioned in the repo |

### Rules of construction

- **No business logic in the client.** Permission checks, school-day derivation, attendance locking and risk detection all live in Postgres functions or Edge Functions.
- **No `select *` from the client.** Query explicit columns so RLS column exposure stays deliberate.
- **Every table has RLS enabled.** A table without a policy is unreadable, which is the correct default.
- **All money-like and time-like config is data.** Deadlines, thresholds and entitlements live in `school_settings` and `leave_types`, never as literals.

---

## 3. Repository layout

The repository is a small monorepo: the client lives under `apps/admin`
(Expo's own root — `app.json`, `App.tsx`, `package.json` — so `expo start`
runs from there directly) and the Supabase project lives under `backend`.
This is the same shape the rest of this document describes as `/app` and
`/supabase`; read those as `apps/admin` and `backend` respectively wherever
they appear below.

```
/apps
  /admin                 Expo React Native application (Expo project root)
    /src
      /screens            One folder per screen, named as in section 10
      /components         Shared presentational components
      /theme              Design tokens + themed base components
      /features           Feature modules: attendance, marks, leave, inventory...
      /lib
        supabase.ts       Client initialisation
        offline/          SQLite queue, sync engine, conflict handling
        permissions.ts    Client-side mirror of permission checks (display only)
      /i18n               Resource bundles; no user-facing string in code
/backend
  /supabase                Supabase CLI project root (everything below is
                            where the CLI itself expects it — this is what
                            `supabase init` generates, not a custom layout)
    config.toml             Supabase CLI project config
    /migrations              Versioned SQL, one file per change
    /functions               Edge Functions
    /seed                    Reference data: roles, permissions, leave types,
                              subjects, grades, dev sample data — run in
                              filename order on `supabase db reset`
    /tests                   pgTAP policy tests, run by `supabase test db`
  README.md                 Local dev commands (supabase start / db push / test db)
/docs
  AdminSRS.pdf             The requirements specification
  AdminSpec.md             This document
```

---

## 4. Data model

Conventions: `uuid` primary keys defaulting to `gen_random_uuid()`; `created_at timestamptz not null default now()`; `updated_at` maintained by trigger; soft deletion via a `status` column, never a hard `DELETE` on records of consequence.

### 4.1 Calendar and configuration

```sql
create table academic_years (
  id            uuid primary key default gen_random_uuid(),
  label         text not null unique,           -- '2026'
  starts_on     date not null,
  ends_on       date not null,
  is_current    boolean not null default false,
  check (ends_on > starts_on)
);
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
-- terms within a year must not overlap: enforced by exclusion constraint
alter table terms add constraint terms_no_overlap
  exclude using gist (
    academic_year_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  );

create type day_type as enum ('school','holiday','half_day','exam','closure');

create table calendar_days (
  id            uuid primary key default gen_random_uuid(),
  on_date       date not null unique,
  day_type      day_type not null,
  label         text,
  created_by    uuid references staff,
  created_at    timestamptz not null default now()
);
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
```

### 4.2 Structure

```sql
create table grades (
  id        uuid primary key default gen_random_uuid(),
  number    smallint not null unique,       -- 1..5
  name      text not null
);

create table classes (
  id                uuid primary key default gen_random_uuid(),
  grade_id          uuid not null references grades,
  academic_year_id  uuid not null references academic_years,
  name              text not null,          -- '4B'
  class_teacher_id  uuid references staff,
  unique (academic_year_id, name)
);

create table subjects (
  id       uuid primary key default gen_random_uuid(),
  name     text not null,
  code     text unique
);

create table grade_subjects (
  grade_id    uuid references grades,
  subject_id  uuid references subjects,
  primary key (grade_id, subject_id)
);

create table class_subject_teachers (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references classes on delete cascade,
  subject_id   uuid not null references subjects,
  staff_id     uuid not null references staff,
  unique (class_id, subject_id)
);
```

### 4.3 People

```sql
create type person_status as enum ('active','inactive','left');

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

create table student_enrolments (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references students on delete cascade,
  class_id          uuid not null references classes,
  academic_year_id  uuid not null references academic_years,
  roll_no           text,
  unique (student_id, academic_year_id)
);
-- A student's class is always read through the enrolment for the current year.
-- Promotion inserts a new row; it never overwrites the previous one.

create table guardians (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  relationship   text,                       -- 'father','mother','grandmother'
  phone_primary  text not null,
  phone_alt      text,
  address        text,
  status         person_status not null default 'active'
);

create table student_guardians (
  student_id   uuid references students on delete cascade,
  guardian_id  uuid references guardians on delete cascade,
  is_primary   boolean not null default false,
  primary key (student_id, guardian_id)
);
create unique index one_primary_guardian
  on student_guardians (student_id) where is_primary;

create table staff (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique,                 -- links to auth.users
  staff_no      text not null unique,
  full_name     text not null,
  phone         text not null,
  email         text,
  joined_on     date,
  status        person_status not null default 'active',
  created_at    timestamptz not null default now()
);
```

### 4.4 Roles, permissions and scope

```sql
create table roles (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,   -- 'principal','sectional_head','class_teacher',
                                       -- 'administrator','staff','vice_principal'
  name         text not null,
  is_system    boolean not null default false
);

create table permissions (
  key          text primary key,       -- 'attendance.mark', 'leave.approve'
  description  text not null
);

create table role_permissions (
  role_id         uuid references roles on delete cascade,
  permission_key  text references permissions on delete cascade,
  primary key (role_id, permission_key)
);

create type scope_type as enum ('school','grade','class','self');

create table staff_roles (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff on delete cascade,
  role_id       uuid not null references roles,
  scope_type    scope_type not null,
  scope_id      uuid,                  -- null when scope_type = 'school' or 'self'
  granted_by    uuid references staff,
  granted_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  check ((scope_type in ('school','self')) = (scope_id is null))
);

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
```

### 4.5 Attendance

```sql
create type attendance_status as enum ('present','absent','late');

create table attendance_submissions (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid not null references classes,
  on_date        date not null,
  submitted_by   uuid not null references staff,
  submitted_at   timestamptz not null default now(),
  locked_at      timestamptz,
  device_id      text,
  unique (class_id, on_date)
);

create table student_attendance (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references students on delete cascade,
  class_id       uuid not null references classes,
  on_date        date not null,
  status         attendance_status not null,
  reason         text,
  marked_by      uuid not null references staff,
  marked_at      timestamptz not null default now(),
  unique (student_id, on_date)
);
create index student_attendance_class_date on student_attendance (class_id, on_date);
create index student_attendance_student_date on student_attendance (student_id, on_date desc);

create table early_leaves (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students on delete cascade,
  on_date       date not null,
  left_at       time not null,
  reason        text,
  collected_by  text,
  recorded_by   uuid not null references staff,
  created_at    timestamptz not null default now()
);

create type staff_attendance_status as enum ('present','late','on_leave','absent');

create table staff_attendance (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff on delete cascade,
  on_date       date not null,
  checked_in_at timestamptz,
  status        staff_attendance_status not null,
  unique (staff_id, on_date)
);
```

### 4.6 Leave

```sql
create table leave_types (
  id                  uuid primary key default gen_random_uuid(),
  key                 text not null unique,     -- 'casual','medical','duty','half_day'
  name                text not null,
  annual_entitlement  numeric(4,1) not null,
  requires_document   boolean not null default false
);

create table leave_balances (
  id                uuid primary key default gen_random_uuid(),
  staff_id          uuid not null references staff on delete cascade,
  leave_type_id     uuid not null references leave_types,
  academic_year_id  uuid not null references academic_years,
  entitled          numeric(4,1) not null,
  used              numeric(4,1) not null default 0,
  unique (staff_id, leave_type_id, academic_year_id)
);

create type leave_status as enum ('pending','approved','rejected','withdrawn');

create table leave_requests (
  id             uuid primary key default gen_random_uuid(),
  staff_id       uuid not null references staff on delete cascade,
  leave_type_id  uuid not null references leave_types,
  starts_on      date not null,
  ends_on        date not null,
  half_day       boolean not null default false,
  day_count      numeric(4,1) not null,
  reason         text not null,
  document_path  text,
  status         leave_status not null default 'pending',
  decided_by     uuid references staff,
  decided_at     timestamptz,
  remarks        text,
  cover_assignment_id uuid references cover_assignments,
  created_at     timestamptz not null default now(),
  check (ends_on >= starts_on)
);
```

### 4.7 Marks

```sql
create type mark_sheet_status as enum ('draft','submitted','reopened');

create table mark_sheets (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references classes,
  subject_id   uuid not null references subjects,
  term_id      uuid not null references terms,
  max_score    numeric(5,2) not null default 100,
  status       mark_sheet_status not null default 'draft',
  submitted_by uuid references staff,
  submitted_at timestamptz,
  reopened_by  uuid references staff,
  unique (class_id, subject_id, term_id)
);

create table marks (
  id             uuid primary key default gen_random_uuid(),
  mark_sheet_id  uuid not null references mark_sheets on delete cascade,
  student_id     uuid not null references students on delete cascade,
  score          numeric(5,2),
  entered_by     uuid not null references staff,
  entered_at     timestamptz not null default now(),
  unique (mark_sheet_id, student_id)
);
```

### 4.8 Student record extras

```sql
create table achievements (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references students on delete cascade,
  title        text not null,
  category     text,          -- 'sports','arts','academic'
  level        text,          -- 'class','school','zonal','national'
  achieved_on  date not null,
  recorded_by  uuid not null references staff
);

create table memberships (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references students on delete cascade,
  group_name   text not null,
  position     text,
  started_on   date,
  ended_on     date
);

create type benefit_status as enum ('pending','issued','active','ended');

create table benefits (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students on delete cascade,
  scheme        text not null,       -- 'free_textbooks','uniform_voucher','midday_meal'
  academic_year_id uuid references academic_years,
  status        benefit_status not null default 'pending',
  issued_on     date,
  issued_by     uuid references staff,
  notes         text
);
```

### 4.9 Staff extras, communications, assets

```sql
create table responsibilities (
  id                uuid primary key default gen_random_uuid(),
  staff_id          uuid not null references staff on delete cascade,
  title             text not null,       -- 'Library duty'
  position          text,                -- 'secretary'
  schedule_note     text,                -- 'Mondays 10:30'
  academic_year_id  uuid not null references academic_years,
  assigned_by       uuid references staff
);

create type audience_type as enum ('all_staff','section','class','individuals');

create table announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text not null,
  priority      smallint not null default 0,
  audience      audience_type not null,
  audience_ids  uuid[],
  attachment_path text,
  publish_at    timestamptz not null default now(),
  author_id     uuid not null references staff,
  created_at    timestamptz not null default now()
);

create table announcement_reads (
  announcement_id uuid references announcements on delete cascade,
  staff_id        uuid references staff on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (announcement_id, staff_id)
);

create table inventory_items (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      text not null,
  location      text,
  condition     text,
  min_quantity  integer not null default 0,
  code          text unique,
  status        text not null default 'active'
);

create type inv_txn_type as enum ('receipt','issue','return','write_off','adjustment');

create table inventory_transactions (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references inventory_items on delete cascade,
  txn_type      inv_txn_type not null,
  quantity      integer not null,      -- signed: receipts positive, issues negative
  note          text,
  actor_id      uuid not null references staff,
  created_at    timestamptz not null default now()
);
-- Current quantity is always sum(quantity). Never store it as a column.

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

create table call_logs (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid references students on delete cascade,
  guardian_id   uuid references guardians,
  staff_id      uuid references staff,
  caller_id     uuid not null references staff,
  purpose       text,
  called_at     timestamptz not null default now()
);
```

### 4.10 System

```sql
create table devices (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff on delete cascade,
  push_token    text not null unique,
  platform      text not null,
  last_seen_at  timestamptz not null default now()
);

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

create table audit_log (
  id           bigserial primary key,
  actor_id     uuid references staff,
  action       text not null,          -- 'insert','update','delete','approve','reopen'
  entity       text not null,
  entity_id    uuid,
  before       jsonb,
  after        jsonb,
  reason       text,
  created_at   timestamptz not null default now()
);
create index audit_log_entity on audit_log (entity, entity_id, created_at desc);

create table attendance_summaries (
  id            uuid primary key default gen_random_uuid(),
  scope_type    text not null,        -- 'student','class','grade','school'
  scope_id      uuid,
  term_id       uuid references terms,
  school_days   integer not null,
  present_days  integer not null,
  pct           numeric(5,2) not null,
  computed_at   timestamptz not null default now(),
  unique (scope_type, scope_id, term_id)
);
```

---

## 5. Permission model

### 5.1 Permission keys

Seed exactly these. Adding a permission later is a migration plus a seed row, not a code change.

```
attendance.mark            attendance.view_board       attendance.remind
attendance.amend_locked    attendance.early_leave
student.view_basic         student.view_full           student.view_benefits
student.edit               student.view_guardian_contact
marks.enter                marks.review                marks.reopen
staff.view_directory       staff.view_full             staff.manage
staff.assign_responsibility
leave.request              leave.approve               leave.view_balances
cover.assign
announcement.publish_all   announcement.publish_section
inventory.view             inventory.manage
event.manage               diary.manage
calendar.manage            analytics.view              report.export
account.manage             audit.view
```

### 5.2 Role seed

| Role | Permissions | Default scope |
|---|---|---|
| `principal` | all keys | `school` |
| `vice_principal` | all except `leave.approve`, `audit.view` | `school` |
| `sectional_head` | `attendance.*` except `amend_locked`; `student.view_full`, `student.view_guardian_contact`; `marks.review`; `staff.view_directory`, `staff.view_full`, `staff.assign_responsibility`, `leave.view_balances`; `cover.assign`; `announcement.publish_section`; `analytics.view`; `leave.request` | `grade` |
| `class_teacher` | `attendance.mark`, `attendance.view_board`, `attendance.early_leave`; `student.view_full`, `student.view_guardian_contact`, `student.view_benefits`; `marks.enter`; `staff.view_directory`; `leave.request` | `class` |
| `administrator` | `student.view_full`, `student.edit`, `student.view_benefits`, `student.view_guardian_contact`; `staff.manage`, `staff.view_full`; `inventory.manage`, `inventory.view`; `event.manage`, `diary.manage`; `account.manage`; `attendance.amend_locked`; `leave.request` | `school` |
| `staff` | `staff.view_directory`, `leave.request` | `self` |

### 5.3 Scope resolution

A user may act on a record if **any** of their unrevoked `staff_roles` rows grants the permission at a scope containing the record.

```sql
create or replace function has_permission(
  p_staff_id uuid,
  p_permission text,
  p_class_id uuid default null
) returns boolean language sql stable as $$
  select exists (
    select 1
    from staff_roles sr
    join role_permissions rp on rp.role_id = sr.role_id
    left join classes c on c.id = p_class_id
    where sr.staff_id = p_staff_id
      and sr.revoked_at is null
      and rp.permission_key = p_permission
      and (
            sr.scope_type in ('school', 'self')
        or (sr.scope_type = 'grade' and c.grade_id = sr.scope_id)
        or (sr.scope_type = 'class' and c.id       = sr.scope_id)
      )
  )
  or exists (
    -- an active cover assignment grants class-teacher rights over that class
    select 1 from cover_assignments ca
    join roles r on r.key = 'class_teacher'
    join role_permissions rp2 on rp2.role_id = r.id
    where ca.staff_id = p_staff_id
      and ca.class_id = p_class_id
      and current_date between ca.starts_on and ca.ends_on
      and rp2.permission_key = p_permission
  );
$$;
```

**Implementation note (see section 17 for the full write-up):** the
`scope_type` enum includes `'self'`, used by the base `staff` role, but a
`WHERE` clause that only matched `'school'`, `'grade'` or `'class'` would
mean a `'self'`-scoped grant could never be true — `staff.view_directory`
for a plain staff member would silently never work. `'self'` is matched
alongside `'school'` above: `has_permission()` answers "does this staff
member hold this permission at all", and the narrower "only over their own
records" restriction (e.g. a leave request) is enforced separately, by that
table's RLS policy checking `staff_id = current_staff_id()`.

Every RLS policy calls this function. Example:

```sql
alter table student_attendance enable row level security;

create policy read_attendance on student_attendance for select
  using (has_permission(current_staff_id(), 'attendance.view_board', class_id)
      or has_permission(current_staff_id(), 'attendance.mark', class_id));

create policy write_attendance on student_attendance for insert
  with check (has_permission(current_staff_id(), 'attendance.mark', class_id)
              and is_school_day(on_date)
              and attendance_is_editable(class_id, on_date));
```

`current_staff_id()` resolves `auth.uid()` to `staff.id`.

### 5.4 Column-level restriction

Two cases need column control rather than row control:

- **Guardian contact numbers** — exposed only through a view `student_guardians_contact` protected by `student.view_guardian_contact`. Plain student queries never join `guardians.phone_*`.
- **Benefits** — a separate table with its own policy requiring `student.view_benefits`. A user without it simply sees no rows, and the client hides the tab when the query returns empty and the permission is absent.

---

## 6. Derived logic

All of the following are Postgres functions. Never reimplement them client-side.

### 6.1 Is a date a school day

```sql
create or replace function is_school_day(p_date date) returns boolean
language sql stable as $$
  select
    case
      when (select day_type from calendar_days where on_date = p_date)
           in ('holiday','closure') then false
      when (select day_type from calendar_days where on_date = p_date) is not null
           then true                                   -- half_day and exam count
      when not exists (select 1 from terms
                       where p_date between starts_on and ends_on) then false
      when extract(isodow from p_date)::smallint
           <> all ((select working_weekdays from school_settings)) then false
      else true
    end;
$$;
```

### 6.2 Attendance editability

```sql
create or replace function attendance_is_editable(p_class uuid, p_date date)
returns boolean language sql stable as $$
  select coalesce(
    (select now() < s.submitted_at
       + make_interval(mins => (select attendance_edit_minutes from school_settings))
     from attendance_submissions s
     where s.class_id = p_class and s.on_date = p_date),
    true)  -- not yet submitted, therefore editable
$$;
```

After the window, writes require `attendance.amend_locked` and a non-null `reason`, and always produce an `audit_log` row.

### 6.3 Consecutive absences

```sql
create or replace function consecutive_absences(p_student uuid, p_as_of date)
returns integer language sql stable as $$
  with days as (
    select on_date, status
    from student_attendance
    where student_id = p_student and on_date <= p_as_of
    order by on_date desc
    limit 30
  ), run as (
    select status, row_number() over (order by on_date desc) rn
    from days
  )
  select coalesce(min(rn) - 1, (select count(*) from run))::int
  from run where status <> 'absent';
$$;
```

### 6.4 Class marking status for a date

Returns one row per class in scope: `class_id, class_name, grade, teacher, submitted (bool), absent_count`. Used by the attendance board and the principal home screen. Implement as a view `v_class_marking_status(on_date)`.

---

## 7. Scheduled jobs

Run via `pg_cron` or Supabase scheduled Edge Functions. **Every one begins by checking `is_school_day(current_date)` and exits immediately if false.**

| Job | Schedule | Behaviour |
|---|---|---|
| `remind_unmarked_classes` | At `attendance_due_at` | For each class with no `attendance_submissions` row today, push to the class teacher (or active cover teacher). Write one `notifications` row per recipient. |
| `escalate_unmarked_classes` | 30 min after deadline | Push a digest of still-unmarked classes to principal and the relevant sectional heads. |
| `lock_attendance` | Hourly | Set `locked_at` on submissions whose edit window has passed. |
| `detect_absence_risk` | Daily, 30 min after deadline | For each active student, if `consecutive_absences >= risk_consecutive_days` or term percentage `< risk_attendance_pct`, notify class teacher, sectional head and principal. Do not re-notify for the same student more than once every 3 days. |
| `mark_staff_absent` | At `day_ends_at` | Any staff member with no `staff_attendance` row and no approved leave for today gets a row with status `absent`. |
| `event_reminders` | Daily, 06:00 | For each event, for each value in `reminder_days`, notify the audience if today matches. |
| `publish_scheduled_announcements` | Every 5 min | Publish announcements whose `publish_at` has passed and which have not yet been sent. |
| `recompute_summaries` | Nightly, 01:00 | Rebuild `attendance_summaries` for student, class, grade and school for the current term. |
| `low_stock_check` | Daily, 07:00 | Notify administrator and principal of items at or below `min_quantity`. |

---

## 8. API surface

Prefer PostgREST (Supabase auto-generated) for straightforward reads and writes, protected by RLS. Use Edge Functions only where a transaction spans several tables or requires privileged work.

### Edge Functions required

| Function | Purpose |
|---|---|
| `POST /submit-attendance` | Accepts `{ class_id, on_date, entries[], device_id, client_submission_id }`. Idempotent on `client_submission_id`. Writes `attendance_submissions` + `student_attendance` in one transaction, returns absentee summary with consecutive-day counts. |
| `POST /approve-leave` | Validates balance, checks overlap, requires cover for class teachers, writes decision + `cover_assignments` + `leave_balances` update + notification, all in one transaction. |
| `POST /assign-cover` | Creates a cover assignment and notifies both teachers. |
| `POST /publish-announcement` | Resolves the audience into recipients, writes reads-pending rows, dispatches push. |
| `POST /declare-closure` | Writes a `calendar_days` row of type `closure`, cancels today's pending reminders, notifies all staff. |
| `POST /import-records` | One-time spreadsheet import. Accepts CSV, validates, returns a reconciliation report of accepted and rejected rows. Never partially commits. |
| `POST /log-call` | Writes a `call_logs` row after a call placed from the app. |
| `GET /export-report` | Generates a spreadsheet for a chosen report and returns a signed URL. |

### Response conventions

- Errors return `{ error: { code, message, field? } }` with a stable `code`. `message` is user-presentable and plain.
- Never return a raw Postgres error to the client.

---

## 9. Offline sync contract

Only three operations are offline-capable: **mark attendance**, **record early leave**, **enter marks**. Everything else requires connectivity and says so plainly.

### Local schema (SQLite)

```sql
create table pending_operations (
  id                   text primary key,   -- uuid generated on device
  operation            text not null,      -- 'submit_attendance' | 'early_leave' | 'save_marks'
  payload              text not null,      -- JSON
  created_at           integer not null,
  attempts             integer not null default 0,
  last_error           text,
  status               text not null default 'pending'  -- pending|syncing|done|failed
);
```

### Rules

1. Every operation carries a device-generated UUID as `client_submission_id`. The server treats a repeat of the same id as a no-op and returns the original result. **Idempotency is mandatory, not best-effort.**
2. The queue drains oldest-first, one operation at a time, on app foreground, on network regain, and every 60 seconds while online.
3. Failed operations retry with exponential backoff up to 24 hours, then surface to the user as a banner with a manual retry.
4. The roster for a teacher's own class is cached locally and refreshed on each successful sync, so the marking screen opens offline.
5. The UI shows sync state at all times: a synced tick, a pending badge with count, or an error banner. **The user must never wonder whether their marking was saved.**
6. Conflicts: server state wins. If a submission arrives after the class was already submitted by someone else, return `409` with the existing submission and let the user view it rather than silently discarding their work.

---

## 10. Screen specifications

Screens are listed with their route name, the data they read, the permission that gates them, and the actions they offer. Build them in the order given by section 12, not in this order.

| Route | Gate | Reads | Actions |
|---|---|---|---|
| `SignIn` | — | — | Sign in, forgot password, biometric unlock |
| `SetPassword` | authenticated, first login | — | Set password |
| `Home` | authenticated | role-dependent, see below | role-dependent |
| `StudentSearch` | `student.view_basic` | students in scope, recent views, at-risk count | Search, browse by class, open risk list |
| `ClassList` | `attendance.view_board` | classes in scope with marking status | Open class |
| `ClassDetail` | `student.view_full` (class) | roster, attendance %, class teacher | Open student, mark attendance |
| `StudentProfile` | `student.view_basic` | student, enrolment, guardians, risk flag, timeline | Call guardian, log call, add note |
| `StudentAttendanceTab` | `student.view_full` | monthly calendar of school days, term %, absence records | Add reason to absence |
| `StudentMarksTab` | `student.view_full` | marks with class averages, term trend, entered-by | — |
| `StudentActivityTab` | `student.view_full` | achievements, memberships, class responsibility | Add achievement, add membership |
| `StudentBenefitsTab` | `student.view_benefits` | current and past benefits with status | Mark collected |
| `MarkAttendance` | `attendance.mark` (class) | cached roster, previous-day absentees | Toggle status, submit |
| `AttendanceSubmitted` | `attendance.mark` | absentee list with consecutive counts and guardians | Call, log call, record early leave |
| `EarlyLeave` | `attendance.early_leave` | roster | Record departure |
| `AttendanceBoard` | `attendance.view_board` | `v_class_marking_status`, staff board | Open class, remind unmarked, switch student/staff tab |
| `MarkEntry` | `marks.enter` | mark sheet, roster | Save draft, submit and lock |
| `MarksReview` | `marks.review` | class and subject comparison, outstanding sheets | Open sheet, reopen (principal) |
| `StaffDirectory` | `staff.view_directory` | staff with presence, duty roster summary | Call, filter, open profile |
| `StaffProfile` | `staff.view_directory` | profile; attendance, responsibilities and leave gated by `staff.view_full` | Call, assign responsibility, change role, deactivate |
| `MyLeave` | `leave.request` | balances, own history | Request leave, withdraw |
| `LeaveRequests` | `leave.approve` | pending requests with impact summary | Reject inline, open detail |
| `LeaveRequestDetail` | `leave.approve` | request, balance, conflicts, coverage gap | Assign cover, approve, reject |
| `Announcements` | authenticated | feed filtered by audience | Open, mark read |
| `ComposeAnnouncement` | `announcement.publish_*` | audience options within scope | Publish, schedule |
| `Inventory` | `inventory.view` | items, low-stock first | Search, filter, scan, issue, add |
| `InventoryItem` | `inventory.view` | item, transaction history | Record movement |
| `EventCalendar` | authenticated | events by month | Open event, add |
| `EventDetail` | authenticated; edit needs `event.manage` | event, reminders | Edit, add to diary |
| `Diary` | authenticated | entries by year | Open, add |
| `AcademicCalendar` | `calendar.manage` | year, terms, working days, rules, counts | Edit terms, edit day, set rules |
| `CalendarDayEditor` | `calendar.manage` | selected day | Set day type, label, save |
| `Analytics` | `analytics.view` | summaries in scope | Change period, drill down |
| `UserAccounts` | `account.manage` | staff accounts and role assignments | Create, assign role with scope, deactivate |
| `AuditLog` | `audit.view` | audit entries | Filter by actor, entity, date |
| `Settings` | authenticated | own profile, notification preferences, language | Edit, sign out |
| `More` | authenticated | permission-filtered menu with badges | Navigate |

### Home screen composition

`Home` is one screen whose blocks are selected by permission, not four separate screens.

| Block | Shown when | Content |
|---|---|---|
| My class attendance card | user is class teacher or active cover for a class, and today is a school day | Marking prompt if unsubmitted; collapsed confirmation if submitted |
| Section status | user holds `attendance.remind` at grade scope | Class chips with marking state, remind button for that section |
| School pulse | user holds `attendance.view_board` at school scope | Unmarked class alert with remind action, then attendance %, staff present, absent count, pending approvals |
| Needs attention | always | Permission-filtered list: leave requests, at-risk students, uncovered classes, low stock, outstanding mark sheets |
| Today | always | Own duties, today's events |
| Quick actions | by permission | Announce, find student, declare closure |

**Ordering rule:** blocks the user must act on come before blocks the user merely reads. The user's own outstanding task always comes first.

---

## 11. Acceptance criteria

Written as executable expectations. Each maps to the SRS requirement in brackets.

### Attendance

- **Given** a class teacher on a school day with attendance unsubmitted, **when** they open the app, **then** the home screen shows a marking prompt as the first block. [FR-ATT-01, NFR-USE-03]
- **Given** the marking screen has loaded, **then** every student is shown as present before any input. [FR-ATT-01]
- **Given** the device has no network, **when** the teacher submits, **then** the submission is queued locally, the UI confirms it, and a pending indicator is visible. [FR-ATT-04, NFR-REL-01]
- **Given** a queued submission and the network returns, **when** sync runs, **then** the record reaches the server exactly once even if sync is triggered repeatedly. [NFR-REL-04]
- **Given** attendance was submitted 20 minutes ago and the window is 60 minutes, **when** the teacher edits it, **then** the edit succeeds. **Given** 90 minutes have passed, **then** the edit is rejected with a message naming who can amend it. [FR-ATT-05, FR-ATT-06]
- **Given** today is a holiday in `calendar_days`, **when** the reminder job runs, **then** it sends nothing and creates no notification rows. [FR-ATT-13, FR-NOT-05]
- **Given** a student has been absent for 3 consecutive school days, **when** the risk job runs, **then** the class teacher, sectional head and principal each receive one notification and the student appears in the at-risk list. [FR-NOT-02, FR-ANL-02]
- **Given** the principal opens the board, **then** unmarked classes appear before marked ones. [FR-ATT-10]

### Permissions

- **Given** a class teacher of 4B, **when** they request attendance rows for 4C, **then** the query returns zero rows regardless of what the client requests. [NFR-SEC-03, NFR-SEC-04]
- **Given** a teacher with an active cover assignment for 4D, **when** they open the marking screen for 4D, **then** they can mark it; **and** on the day after the assignment ends, they cannot. [FR-COV-02]
- **Given** a sectional head for grade 4, **when** they view student profiles, **then** grade 4 students show fully and other students show name, class and photo only. [FR-STU-10]
- **Given** a user without `student.view_benefits`, **then** the benefits tab is not rendered and the underlying query returns no rows. [FR-ACH-05]

### Leave

- **Given** a pending request from a class teacher, **when** the principal attempts to approve from the list, **then** approval is not offered; only rejection and review are. [FR-LVE-05]
- **Given** approval of a class teacher's leave with no cover nominated, **then** the request cannot be approved until a cover teacher is chosen or the principal explicitly acknowledges none is needed. [FR-LVE-06]
- **Given** approval succeeds, **then** the balance decreases, the staff member shows as on leave for those dates, an audit row exists, and the requester is notified. [FR-LVE-07, FR-LVE-08, FR-LVE-10]

### Calendar

- **Given** a date inside a term, on a working weekday, with no override, **then** `is_school_day` returns true. [FR-CAL-04]
- **Given** the principal declares a closure for today, **then** pending reminders for today are cancelled, the day is excluded from attendance denominators, and all staff are notified. [FR-CAL-06]
- **Given** a past school day is changed to a holiday, **then** the user is warned that percentages will be recalculated, and after saving the affected summaries are rebuilt. [FR-CAL-07]

### Marks

- **Given** a submitted mark sheet, **when** the teacher attempts to edit it, **then** the edit is rejected and the message states that only the principal may reopen it. [FR-MRK-03]
- **Given** a student's marks view, **then** each subject shows the class average for the same subject and term beside the student's score. [FR-MRK-05]

---

## 12. Build order

Each task must pass its test before the next begins.

| # | Task | Passes when |
|---|---|---|
| 1 | Repo, Expo app, Supabase project, CI, migration pipeline | A trivial migration deploys and the app boots on a device |
| 2 | Tables from section 4.1–4.4; seed roles, permissions, role_permissions, leave types, subjects | Seed data loads; `has_permission` returns correct results for hand-written cases |
| 3 | Auth: sign in, first-password set, reset by OTP, session handling | A seeded principal and a seeded class teacher can each sign in |
| 4 | RLS policies for all existing tables, with pgTAP tests | A class teacher cannot read another class's rows in any query |
| 5 | Spreadsheet import for students, guardians, staff, classes | Reconciliation report lists accepted and rejected rows; no partial commit |
| 6 | Academic calendar: years, terms, working days, day overrides, `is_school_day` | Function returns correct results across term boundaries, weekends and overrides |
| 7 | Student and staff directories, search, profile shell | Search finds a student by partial admission number within scope |
| 8 | **Offline engine**: SQLite queue, sync loop, idempotency, sync indicators | A queued operation survives app restart and syncs exactly once |
| 9 | Mark attendance, submit, edit window, confirmation with absentees | A full class can be marked and submitted in under 30 seconds in airplane mode |
| 10 | Attendance board, class drill-down, remind unmarked | Principal sees unmarked classes first and can remind them |
| 11 | Scheduled jobs: reminder, escalation, lock, risk detection | On a seeded holiday, no job produces output |
| 12 | Early leave, staff check-in, staff attendance board | Three-state staff board renders with cover status |
| 13 | Leave: request, balances, approval with impact, cover assignment | Approval without cover for a class teacher is blocked |
| 14 | Marks: sheets, entry, lock, reopen, class averages, trends | Locked sheet resists edits from its own author |
| 15 | Achievements, memberships, benefits, student timeline | Benefits tab absent for a user lacking the permission |
| 16 | Announcements: compose, audience resolution, push, read receipts | A section announcement reaches only that section |
| 17 | Responsibilities and duty roster | Same data reachable from person and from duty |
| 18 | Inventory: items, transactions, derived quantity, low stock | Quantity always equals the transaction sum |
| 19 | Events, reminders, school diary | Event reminder fires at the configured lead time |
| 20 | Analytics, summaries job, exports | Dashboard renders in under two seconds from summaries |
| 21 | User accounts, role assignment with scope, audit log viewer | A new sectional head sees exactly one grade |
| 22 | Settings, notification preferences, i18n extraction | No user-facing string remains hard-coded |
| 23 | Hardening: rate limiting, backup restore test, accessibility pass | Restore from backup succeeds; contrast and tap targets verified |

---

## 13. Seed data required for development

- One academic year with three terms matching the school's real dates.
- Five grades, thirty classes, roughly thirty students per class with realistic Sinhala and Tamil names.
- Thirty-five staff with the full range of roles, including one person holding both `sectional_head` (grade) and `class_teacher` (class).
- One class teacher on approved leave with a cover assignment, and one without — the uncovered case must be visible in development.
- One student with three consecutive absences, so the risk path is exercised.
- A holiday, a half day and an exam day inside the current term.

---

## 14. Definition of done

A task is complete when all of the following hold.

- The behaviour matches its acceptance criteria in section 11.
- Server-side enforcement exists for every rule; removing the client would not weaken it.
- RLS policies exist for every new table and are covered by a pgTAP test.
- Every write path produces an `audit_log` row where the SRS requires one.
- No user-facing string is hard-coded outside `/i18n`.
- Any offline-capable operation is idempotent and has a test proving repeated submission creates one record.
- Every new configurable value lives in `school_settings` or a reference table, not in code.
- The screen works at 360 dp width, with 44 dp tap targets and 4.5:1 text contrast.

---

## 15. Open decisions and interim defaults

Where a decision is unresolved, build the default and make it configurable.

| # | Question | Default to build |
|---|---|---|
| 1 | How staff attendance is captured | Self check-in in the app. Keep the write path generic so a geofence or register can supply it later. |
| 2 | Who approves leave | Principal approves all. Store `approver_role` on `leave_types` so section-level approval can be enabled later. |
| 3 | Sectional head sight of leave balances | Granted for own section (`leave.view_balances` at grade scope). |
| 4 | Who edits the academic calendar | Principal only. `calendar.manage` is not granted to `administrator`. |
| 5 | What a class teacher sees of other classes' students | Name, class, photo only. |
| 6 | Absence-risk thresholds | 3 consecutive days, or below 80% for the term. Both in `school_settings`. |
| 7 | Whether parents will see marks | Not decided; phase 2. Do not expose marks through any public view in phase 1. |
| 8 | Second language at launch | Build i18n infrastructure, ship English only. |
| 9 | Distribution | Internal distribution to staff devices; do not assume public store review timelines. |

---

## 16. Explicitly out of scope

Do not build, and do not leave scaffolding for: the parent application, fee collection, timetabling, examination paper management, certificate generation, library circulation, transport, biometric hardware integration, external authority reporting, or a web console.

---

## 17. Build progress

Updated as each task in section 12 is worked. Status is one of: **not
started**, **in progress**, **done**. "Done" means the task's stated test
in section 12 is believed to pass by code review; where this environment
has no live Supabase project or device, that limitation is noted instead of
claimed as verified.

| # | Task | Status | Note |
|---|---|---|---|
| 1 | Repo, Expo app, Supabase project, CI, migration pipeline | done | Git repo initialized. Expo app scaffolded: theme (tokens.ts, matches logo), base components, Supabase client, i18n, Zustand auth-session store, full navigation shell (all §10 routes registered, unbuilt ones show a tagged placeholder). Typecheck/lint/vitest all clean; `expo export --platform android` bundles 1076 modules with no errors — the closest available proxy for "boots" in this environment (no device/emulator here). CI workflow added (`.github/workflows/ci.yml`). Supabase project itself is code-only — not run, see backend/README.md. |
| 2 | Core tables (4.1–4.4) + seed roles/permissions/leave types/subjects | done | All tables from §4.1–4.4 migrated, plus `audit_log` and `leave_types` pulled forward (both needed by this task's own seed/audit requirements). `has_permission()`/`current_staff_id()` implemented per §5.3, with a bug fix (see below). Seed files for roles/permissions/role_permissions/grades/subjects/leave_types/school_settings, plus a reduced-scale dev sample dataset (§13). pgTAP test file with 10 hand-written `has_permission` cases. **Not executed against a live Postgres** — no Supabase CLI/Docker in this environment; verified by review only. Run `supabase db reset && supabase test db` per backend/README.md to confirm. |
| 3 | Auth: sign in, first-password set, reset by OTP, session handling | done | SignIn (email + password), SetPassword (first-login, see the `needs_password_set` convention below), and a phone-based OTP password-reset flow (phone chosen over email because `staff.phone` is required and `staff.email` is optional — see below) all built and wired through `authStore`/`RootNavigator`. Session persists via AsyncStorage. **Not verified against a live project**: the dev seed's staff rows have no linked `auth.users` yet (see the seed file's own comment for how to link one), and OTP delivery depends on the project's SMS provider being configured — neither is available in this environment. |
| 4 | RLS policies for all tables, with pgTAP tests | in progress | Every table through build task 11 has policies (§4.1–4.5, `audit_log`, `leave_types`, `devices`, `notifications`) — see the `..._rls_policies_phase1.sql` and `..._attendance.sql` migrations, plus `student_guardians_contact` (§5.4) and two pgTAP tests proving cross-class isolation (§11's stated acceptance test, on `student_enrolments` and again end-to-end via `submit_attendance()`). Marked "in progress" rather than "done" because later build tasks each introduce their own new tables and must add policies alongside them — this task doesn't have a single finish line under this build order. **Not executed against a live Postgres.** |
| 5 | Spreadsheet import for students, guardians, staff, classes | in progress | `import_students()` (SECURITY DEFINER, `student.edit`) uses a PL/pgSQL `BEGIN/EXCEPTION` block per row, which creates an implicit `SAVEPOINT` — a failing row (e.g. duplicate `admission_no`) rolls back only itself, while every other row in the same call stays committed. That's what makes "never partially commits" (nothing lost to a crash mid-way) and "reconciliation report of accepted and rejected rows" (a normal call differentiates row-by-row) both true at once — a plain loop of inserts can't do both. `import-records` Edge Function parses CSV, Zod-validates each row, and calls the RPC; pgTAP test proves a rejected row doesn't block or corrupt its neighbors. **Scope**: implemented for students (+ guardian + enrolment) only, not guardians/staff/classes as their own import paths — the goal was one complete, correct example of the pattern rather than four shallow ones; each would follow the identical shape. No dedicated screen either — section 10 doesn't allocate one, so it's a section on `UserAccountsScreen` (paste CSV; no file-picker library is installed). |
| 6 | Academic calendar + `is_school_day` | done | `is_school_day()` implemented verbatim from §6.1. `AcademicCalendarScreen` (terms, editable `school_settings` rules — due time, edit window) and `CalendarDayEditorScreen` (set a day's type/label) built, both effectively principal-only since `calendar.manage` is the write gate. |
| 7 | Student and staff directories, search, profile shell | done | `StudentSearch` (search by name/admission number + browse-by-class), `ClassDetail` (roster), `StudentProfile` (basic info + guardians, gated automatically by RLS + `student_guardians_contact`; Attendance/Marks/Activity/Benefits sections shown as "coming with task N"), `StaffDirectory` and `StaffProfile` (basic info; Attendance/Responsibilities/Leave similarly deferred). All read through TanStack Query hooks calling Supabase directly — no client-side permission gating built yet (out of scope until Home needs it, per the plan); screens simply show whatever RLS returns, with an empty state otherwise. |
| 8 | Offline engine: SQLite queue, sync loop, idempotency | done | `pending_operations` table (section 9) via `expo-sqlite`, plus a `last_attempt_at` column not in the spec's schema — needed to compute exponential backoff across app restarts, see below. `enqueueOperation`/`drainQueue`/`manualRetry`/`registerOperationHandler` in `src/lib/offline/queue.ts`; the retry/backoff/24h-stuck decisions are pure functions in `backoff.ts` (vitest-covered — native SQLite/Crypto imports can't run under Vitest, so the math is kept separate from the DB code that uses it). Drain triggers wired per rule 2 (foreground, network regain via `expo-network`'s listener, 60s interval) in `useSyncEngine()`, mounted at the app root. `SyncStatusBadge` component for rule 5 (tick / pending count / error banner), now placed on `MarkAttendanceScreen` and `AttendanceSubmittedScreen`. Idempotency: `pending_operations.id` **is** the `client_submission_id`, generated with `expo-crypto`. As of task 9, `submit_attendance` has a real handler (`src/features/attendance/init.ts`) — end-to-end draining is wired but still unverified against a live project/device. |
| 9 | Mark attendance, submit, edit window, confirmation | done | `student_attendance`/`attendance_submissions` (§4.5) + `attendance_is_editable()`/`consecutive_absences()` (§6.2/6.3) + RLS. `submit_attendance()` Postgres function does the real transactional work (SECURITY INVOKER — every insert still goes through the caller's own RLS), wrapped by the `submit-attendance` Edge Function. `MarkAttendanceScreen` (cache-first roster, default-all-present, offline via the task-8 queue), `AttendanceSubmittedScreen` (local echo → server-confirmed absentee list with consecutive counts, once synced). See the design-decision notes below for how "edit" vs "conflict" ended up split across two different code paths, and for the `client_submission_id` column this needed. Not run against a live device/airplane-mode — see the same caveat as every other task. |
| 10 | Attendance board, class drill-down, remind unmarked | done | `v_class_marking_status(on_date)` (§6.4, implemented as a set-returning function — Postgres views can't take parameters) — unmarked classes sort first, matching FR-ATT-10. `AttendanceBoardScreen` + a `remind_unmarked_class()` RPC for the per-class manual remind action (distinct from the scheduled digest in task 11). `ClassDetailScreen` now offers "Mark attendance" or "View today's attendance" depending on submission state. |
| 11 | Scheduled jobs: reminder, escalation, lock, risk detection | done | All four jobs from §7, every one gated on `is_school_day(current_date)` first. `devices`/`notifications` (§4.10) pulled forward since these jobs need somewhere to write to. pg_cron can't follow a *column's* value (`school_settings.attendance_due_at`), so the reminder/escalation/risk jobs run every 5 minutes and self-gate on a time-of-day window instead — see the migration's own comment. pgTAP test proves zero output on a holiday (§11's stated acceptance test) for all four jobs. **Not run** — no pg_cron/live Postgres here, and push dispatch to Expo's push service (turning a `notifications` row into an actual device notification) isn't built: these jobs write rows to the in-app notification center, which is as far as this environment lets me verify anything real (no device push tokens to send to anyway). |
| 12 | Early leave, staff check-in, staff attendance board | not started | |
| 12 | Early leave, staff check-in, staff attendance board | done | `early_leaves`/`staff_attendance` (§4.5) + RLS. `EarlyLeaveScreen` (reachable from `AttendanceSubmitted`), self check-in via a `check_in_self()` RPC (server decides present-vs-late from `school_settings.staff_late_after`, not a client-reported status) surfaced as a card on Home, and a student/staff tab switch added to `AttendanceBoardScreen` per section 10's "switch student/staff tab" action. `mark_staff_absent` job written but lands in the next migration (needs `leave_requests` to check "no approved leave"). |
| 13 | Leave: request, balances, approval, cover assignment | done | `leave_balances`/`leave_requests` (§4.6). `approve_leave()`/`reject_leave()` (SECURITY DEFINER, since they touch balances/cover/notifications with no general client write policy) implement the cover-required rule and the balance debit atomically; `assign_cover()` for cover assigned outside a leave request. A `can_view_staff_leave()` helper resolves section 15 open decision #3 ("sectional head sees own section's balances") — see the migration comment for why this couldn't just be `has_permission(..., 'grade')` the way everything else is. `MyLeaveScreen`/`LeaveRequestsScreen`/`LeaveRequestDetailScreen` built (plain YYYY-MM-DD text fields for dates — no date-picker library is installed). pgTAP test proves the cover-required block and the acknowledged-override path (§11's stated acceptance test). `mark_staff_absent` job now complete alongside these tables. |
| 14 | Marks: sheets, entry, lock, reopen, averages, trends | done | `mark_sheets`/`marks` (§4.7) + RLS (`write_marks` only allows writes while `status = 'draft'`, satisfying FR-MRK-03 by construction). `submit_mark_sheet()`/`reopen_mark_sheet()` (SECURITY DEFINER, `marks.enter`/`marks.reopen` respectively) and `class_subject_average()` for FR-MRK-05. `MarkEntryScreen` (reachable from `ClassDetail` via a subject picker over `grade_subjects` — there's no dedicated subject-teacher-assignment UI yet, so this doesn't limit to `class_subject_teachers`), `MarksReviewScreen` (visible sheets, reopen for principal), and a marks section added to `StudentProfileScreen` (score beside class average, per FR-MRK-05). No **trends** (term-over-term) yet — that needs `attendance_summaries`-style aggregation, deferred to task 20 (analytics) where the same aggregation machinery is being built anyway. pgTAP test proves a submitted sheet resists edits and that only `marks.reopen` (not `marks.enter`) can reopen it. |
| 15 | Achievements, memberships, benefits, student timeline | done | `achievements`/`memberships`/`benefits` (§4.8) + RLS — benefits kept on its own `student.view_benefits` permission per §5.4, independent of `student.view_full`. `ActivitySection`/`BenefitsSection` added to `StudentProfileScreen` (add achievement/membership, mark a benefit collected) — folded into the one profile screen rather than separate tab screens, same pattern as marks/guardians. No separate "student timeline" merging attendance+marks+activity+calls into one chronological feed — section 10 doesn't name it as its own screen, and the profile screen's sections already surface all of it, just not interleaved by date. |
| 16 | Announcements: compose, audience, push, read receipts | done | `announcements`/`announcement_reads` (§4.9) + RLS. `staff_matches_audience()` resolves all four audience types (all_staff/section/class/individuals) to a recipient set, used both by RLS (what can I see) and `do_publish_announcement()` (who gets a reads-pending row + notification). `create_announcement()` publishes immediately or leaves it for `job_publish_scheduled_announcements` depending on `publish_at`; "already dispatched" is tracked by whether `announcement_reads` rows exist yet rather than a separate flag. `AnnouncementsScreen` (feed, tap to mark read) and `ComposeAnnouncementScreen` (title/body/audience picker) built, now completing all five bottom tabs with real screens. "Push" here means an in-app `notifications` row, same caveat as every other job — no device push tokens exist in this environment to actually dispatch to Expo's push service. |
| 17 | Responsibilities and duty roster | done | `responsibilities` (§4.9) + RLS — readable by any signed-in staff (duty rosters are ordinarily posted/public within a school), writes gated by `staff.assign_responsibility`. `ResponsibilitiesSection` added to `StaffProfileScreen` (assign action), and a "By duty" toggle added to `StaffDirectoryScreen` reading the same table grouped differently — satisfies the task's stated test ("same data reachable from person and from duty") without a new route. |
| 18 | Inventory: items, transactions, derived quantity, low stock | done | `inventory_items`/`inventory_transactions` (§4.9) + RLS — transactions are append-only (no update/delete policy; a correction is a new `'adjustment'` row, matching real stock books). `inventory_quantity()` sums the ledger — never stored, per the table's own comment. `job_low_stock_check` (daily 07:00, notifies administrator/principal). `InventoryScreen` (search, add item, low-stock sorted first) and `InventoryItemScreen` (record movement, transaction history). No barcode "scan" action — section 10 lists it but no camera/scanner library is installed; searching by code works the same way manually. |
| 19 | Events, reminders, school diary | done | `events`/`diary_entries` (§4.9) + RLS (both school-wide readable, writes gated by `event.manage`/`diary.manage`). `job_event_reminders` (daily 06:00) fires per `reminder_days` entry; since section 7 doesn't specify who "the audience" actually is, it's the event's `responsible_id` if set, else every active staff member — noted in the migration. `EventCalendarScreen` (month view, add event), `EventDetailScreen` (add to diary), `DiaryScreen` (entries by year, add). |
| 20 | Analytics, summaries job, exports | done | `attendance_summaries` (§4.10) + RLS. `recompute_attendance_summaries()` rebuilds student/class/grade/school rows for the current term; `job_recompute_summaries` runs nightly at 01:00 **without** the usual `is_school_day` gate — by 1am the date has rolled to the day after the one being summarized, and this job rebuilds cumulative term-to-date totals rather than "did something happen today", so skipping it after a holiday would let summaries go stale across a whole break (documented as a deliberate exception, not an oversight). `export-report` is the one Edge Function beyond submit-attendance that earns its Deno layer — generates a CSV and returns a signed Storage URL, using the caller's own JWT throughout so both the read and the storage write go through real RLS/storage policies, not a service-role bypass pretending to check `report.export`. `AnalyticsScreen` (school + per-grade attendance %, CSV export). |
| 21 | User accounts, role assignment with scope, audit log viewer | done | Widened `write_staff`'s RLS policy to accept `account.manage` as well as `staff.manage` — creating the staff row is part of what "create a user account" means. `UserAccountsScreen` (create staff record, assign role+scope, deactivate/reactivate) and `AuditLogScreen` (most recent 100 entries). **Scope note**: actually issuing a login (an `auth.users` row) needs Supabase's admin API, callable only with the service role — never from this app. Section 8's Edge Function list is exactly 8 and doesn't include account creation, so this build treats "give someone a login" as an out-of-band administrative step (Supabase Studio, or the admin API from a trusted context), same as the dev seed data's own instructions — the in-app screen covers everything RLS can safely do directly. |
| 22 | Settings, notification preferences, i18n extraction | in progress | `SettingsScreen` built: profile display, sign out, and a real notification-preferences flow (`expo-notifications` permission request + `getExpoPushTokenAsync` + a `devices` row) — degrades to a clear "not configured" message when there's no EAS project id in `app.json`, which this build doesn't have. Language is fixed to English per §15 open decision #8. **i18n extraction is incomplete**: the `i18next` infrastructure from build task 1 is real and the original scaffold (auth, nav labels) uses it, but the ~20 feature screens built in tasks 9–21 mostly write English strings inline rather than through `useTranslation()`. Given only English ships in this phase (open decision #8), this was deprioritized in favor of functional coverage across more of section 12 — it does **not** meet task 22's stated completion test ("no user-facing string remains hard-coded outside /i18n") as written. Left honestly open rather than marked done. |
| 23 | Hardening: rate limiting, backup restore test, accessibility pass | not started | |

### Known deviations from this document

- **Repository layout** (§3): client under `apps/admin`, backend under
  `backend`, not `/app` + `/supabase` at repo root. Reason: that layout
  already existed in the repo before this build started.
- **No live Supabase project in the build environment**: migrations, Edge
  Functions, and pgTAP tests are written to the Supabase CLI's expected
  layout but not executed here (no CLI/Docker/Postgres available). See
  `backend/README.md` for the commands to run them locally.
- **`has_permission()` bug fix**: section 5.3's `WHERE` clause is corrected
  to also match `scope_type = 'self'` (see the implementation note there).
  As originally written, no `'self'`-scoped grant could ever be true.
- **First-login detection**: not specified by this document. An account
  created without a password (build task 21) carries
  `user_metadata.needs_password_set = true`; `SetPassword` clears it after
  the user chooses one. `src/store/authStore.ts` is the reference.
- **Password reset method**: section 10 says `SignIn` offers "forgot
  password" and build task 3 says "reset by OTP" without saying which
  channel. Implemented over phone/SMS rather than email, because
  `staff.phone` is required and `staff.email` is optional (section 4.3) —
  an email-only reset would lock out any staff member without one on file.
- **Offline queue schema**: section 9's `pending_operations` table gains
  one column beyond what's listed, `last_attempt_at integer`. Rule 3's
  exponential backoff "up to 24 hours" can't be computed correctly across
  app restarts from `attempts` and `created_at` alone — there's no way to
  know when the *last* try happened, only the first. See `src/lib/offline/
  backoff.ts`.
- **"Edit" vs "conflict" for attendance, and a new `client_submission_id`
  column.** Section 9 rule 6 says a late-arriving submission that finds the
  class already submitted "by someone else" should 409, not merge — but
  section 11 also requires that editing *your own* just-submitted class
  within the edit window succeeds. Both are true of the same situation
  (`attendance_submissions` row already exists) unless something
  distinguishes "this is a second, independent submission" from "this is
  the class teacher revising their own." Resolution: `submit_attendance()`
  (build task 9) only ever *creates* — a second submission for the same
  (class, date) is always a 409, full stop, using a `client_submission_id`
  column added to `attendance_submissions` (not in section 4.5's table) so
  a genuine retry of the *same* request can still be told apart from a
  conflicting one. Editing an existing submission is a separate, always-
  online action — a plain client update against `student_attendance`,
  enforced entirely by the `amend_student_attendance` RLS policy (which
  already encodes the edit-window / `amend_locked`+reason rule) — it
  doesn't go through this function or the offline queue at all, since
  section 9 only lists three operations as offline-capable and editing an
  already-submitted class isn't one of them.
- **pg_cron can't follow a configurable time.** `school_settings.
  attendance_due_at` can change at runtime, but a pg_cron schedule is a
  static cron expression. `remind_unmarked_classes`, `escalate_
  unmarked_classes`, `detect_absence_risk` and (build task 12)
  `mark_staff_absent` run every 5 minutes and self-gate on a local-time
  window around the configured time instead of being scheduled to fire
  once, exactly then.
- **`leave_requests.cover_not_needed`**: not in section 4.6's table, but
  section 11 requires the principal to be able to "explicitly acknowledge"
  that no cover is needed, and there's nowhere else to persist that.
- **`assign-cover` is an RPC only, not also an Edge Function.** Section 8
  lists 8 Edge Functions; each gets a real Postgres function doing the
  actual transactional/permission-checked work, but this build only wraps
  that in a Deno function where the wrapper earns its keep (request
  validation shared with an offline client, or work Postgres can't do —
  parsing a spreadsheet, generating a signed export URL). `assign-cover` is
  a single permission-checked write with no such need, so `assign_cover()`
  is called directly via `supabase.rpc()` — same security posture, one
  fewer moving part. `submit-attendance` keeps its Edge Function because
  the offline queue needs a stable HTTP endpoint to retry against.
- **`mark_sheet_status.'reopened'` never rests.** `reopen_mark_sheet()`
  sets a sheet straight back to `'draft'` rather than leaving it at
  `'reopened'`, so the one `write_marks` RLS policy (which only allows
  `status = 'draft'`) covers both first entry and post-reopen editing
  without a second, near-duplicate policy. `reopened_by` still records who
  reopened it.
- **`announcement_reads.read_at` made nullable.** Section 4.9 declares it
  `not null default now()`, but section 8 also says publishing "writes
  reads-pending rows" — a row that means *unread* can't simultaneously
  default its read timestamp to the moment it was created. `read_at` is
  null until the recipient actually opens it.
