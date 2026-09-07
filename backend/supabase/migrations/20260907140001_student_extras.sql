-- AdminSpec.md section 4.8 — achievements, memberships, benefits. Build task 15.

create table achievements (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references students on delete cascade,
  title        text not null,
  category     text,          -- 'sports','arts','academic'
  level        text,          -- 'class','school','zonal','national'
  achieved_on  date not null,
  recorded_by  uuid not null references staff
);
alter table achievements enable row level security;

create table memberships (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references students on delete cascade,
  group_name   text not null,
  position     text,
  started_on   date,
  ended_on     date
);
alter table memberships enable row level security;

create type benefit_status as enum ('pending', 'issued', 'active', 'ended');

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
alter table benefits enable row level security;

-- Achievements/memberships: same visibility as the rest of a student's
-- profile (student.view_full), scoped through the current enrolment.
create policy read_achievements on achievements for select
  using (has_permission(current_staff_id(), 'student.view_full', student_current_class_id(student_id)));
create policy write_achievements on achievements for insert
  with check (
    has_permission(current_staff_id(), 'student.view_full', student_current_class_id(student_id))
    and recorded_by = current_staff_id()
  );

create policy read_memberships on memberships for select
  using (has_permission(current_staff_id(), 'student.view_full', student_current_class_id(student_id)));
create policy write_memberships on memberships for all
  using (has_permission(current_staff_id(), 'student.view_full', student_current_class_id(student_id)))
  with check (has_permission(current_staff_id(), 'student.view_full', student_current_class_id(student_id)));

-- Benefits: section 5.4's second column-level restriction — its own
-- permission (student.view_benefits), independent of student.view_full.
create policy read_benefits on benefits for select
  using (has_permission(current_staff_id(), 'student.view_benefits', student_current_class_id(student_id)));
create policy write_benefits on benefits for all
  using (has_permission(current_staff_id(), 'student.view_benefits', student_current_class_id(student_id)))
  with check (has_permission(current_staff_id(), 'student.view_benefits', student_current_class_id(student_id)));
