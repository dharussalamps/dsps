-- pgTAP tests for has_permission() (AdminSpec.md section 5.3).
-- Run with: supabase test db
-- Self-contained: builds its own fixture rows (prefixed test_) inside a
-- transaction that is rolled back at the end, so it does not depend on
-- seed data and leaves no trace either way.

begin;
select plan(9);

-- Fixture: one grade, two classes in it, a third class in a different
-- grade; one role per scope kind; one permission; one staff member per
-- scenario. Own academic_year row so this never depends on seed data.
insert into grades (number, name) values (91, 'Test Grade 91'), (92, 'Test Grade 92');

insert into academic_years (label, starts_on, ends_on)
values ('test-fixture-year', '2000-01-01', '2000-12-31');

insert into classes (grade_id, academic_year_id, name)
select (select id from grades where number = 91),
       (select id from academic_years where label = 'test-fixture-year'),
       'TestClassA';

insert into classes (grade_id, academic_year_id, name)
select (select id from grades where number = 91),
       (select id from academic_years where label = 'test-fixture-year'),
       'TestClassB';

insert into classes (grade_id, academic_year_id, name)
select (select id from grades where number = 92),
       (select id from academic_years where label = 'test-fixture-year'),
       'TestClassC';

insert into roles (key, name) values
  ('test_school_role', 'Test School Role'),
  ('test_grade_role',  'Test Grade Role'),
  ('test_class_role',  'Test Class Role'),
  ('test_class_teacher_role_stand_in', 'Test Cover Role')
on conflict (key) do nothing;

-- Reuse the real 'class_teacher' role for the cover-assignment path, since
-- has_permission() hard-codes role key = 'class_teacher' for cover grants.
insert into roles (key, name) values ('class_teacher', 'Class Teacher')
on conflict (key) do nothing;

insert into permissions (key, description) values
  ('test.permission', 'Fixture permission for has_permission tests')
on conflict (key) do nothing;

insert into role_permissions (role_id, permission_key)
select id, 'test.permission' from roles
where key in ('test_school_role', 'test_grade_role', 'test_class_role', 'class_teacher')
on conflict do nothing;

insert into staff (staff_no, full_name, phone) values
  ('TEST-SCHOOL', 'Test School Scope', '0000000001'),
  ('TEST-GRADE',  'Test Grade Scope',  '0000000002'),
  ('TEST-CLASS',  'Test Class Scope',  '0000000003'),
  ('TEST-REVOKED','Test Revoked',      '0000000004'),
  ('TEST-COVER',  'Test Cover Scope',  '0000000005'),
  ('TEST-NOPERM', 'Test No Permission','0000000006')
on conflict (staff_no) do nothing;

insert into staff_roles (staff_id, role_id, scope_type, scope_id)
select (select id from staff where staff_no = 'TEST-SCHOOL'), (select id from roles where key = 'test_school_role'), 'school', null;

insert into staff_roles (staff_id, role_id, scope_type, scope_id)
select (select id from staff where staff_no = 'TEST-GRADE'), (select id from roles where key = 'test_grade_role'), 'grade', (select id from grades where number = 91);

insert into staff_roles (staff_id, role_id, scope_type, scope_id)
select (select id from staff where staff_no = 'TEST-CLASS'), (select id from roles where key = 'test_class_role'), 'class', (select id from classes where name = 'TestClassA');

insert into staff_roles (staff_id, role_id, scope_type, scope_id, revoked_at)
select (select id from staff where staff_no = 'TEST-REVOKED'), (select id from roles where key = 'test_school_role'), 'school', null, now();

insert into cover_assignments (class_id, staff_id, starts_on, ends_on, assigned_by)
select (select id from classes where name = 'TestClassA'),
       (select id from staff where staff_no = 'TEST-COVER'),
       current_date - 1, current_date + 1,
       (select id from staff where staff_no = 'TEST-SCHOOL');

-- 1. School-scope role: permission granted for any class.
select ok(
  has_permission((select id from staff where staff_no = 'TEST-SCHOOL'), 'test.permission', (select id from classes where name = 'TestClassA')),
  'school-scope role grants permission for any class'
);
select ok(
  has_permission((select id from staff where staff_no = 'TEST-SCHOOL'), 'test.permission', (select id from classes where name = 'TestClassC')),
  'school-scope role grants permission even for a class in a different grade'
);

-- 2. Grade-scope role: granted only for classes in that grade.
select ok(
  has_permission((select id from staff where staff_no = 'TEST-GRADE'), 'test.permission', (select id from classes where name = 'TestClassB')),
  'grade-scope role grants permission for a class in the same grade'
);
select ok(
  not has_permission((select id from staff where staff_no = 'TEST-GRADE'), 'test.permission', (select id from classes where name = 'TestClassC')),
  'grade-scope role denies permission for a class in a different grade'
);

-- 3. Class-scope role: granted only for that exact class.
select ok(
  has_permission((select id from staff where staff_no = 'TEST-CLASS'), 'test.permission', (select id from classes where name = 'TestClassA')),
  'class-scope role grants permission for its own class'
);
select ok(
  not has_permission((select id from staff where staff_no = 'TEST-CLASS'), 'test.permission', (select id from classes where name = 'TestClassB')),
  'class-scope role denies permission for a sibling class in the same grade'
);

-- 4. Revoked role never grants.
select ok(
  not has_permission((select id from staff where staff_no = 'TEST-REVOKED'), 'test.permission', (select id from classes where name = 'TestClassA')),
  'revoked staff_roles row grants nothing'
);

-- 5. Active cover assignment grants class_teacher permissions for the
--    covered class; a class the covering teacher was never assigned to
--    stays denied.
select ok(
  has_permission((select id from staff where staff_no = 'TEST-COVER'), 'test.permission', (select id from classes where name = 'TestClassA')),
  'active cover assignment grants permission for the covered class'
);
select ok(
  not has_permission((select id from staff where staff_no = 'TEST-COVER'), 'test.permission', (select id from classes where name = 'TestClassB')),
  'cover assignment does not grant permission for an unrelated class'
);

select * from finish();
rollback;
