-- pgTAP test for AdminSpec.md section 11 ("Given a class teacher of 4B,
-- when they request attendance rows for 4C, then the query returns zero
-- rows regardless of what the client requests") applied here to students /
-- student_enrolments, since attendance tables land in build task 9.
--
-- Simulates being a specific signed-in user the way PostgREST does: sets
-- the `request.jwt.claim.sub` session var that Supabase's auth.uid() reads,
-- then runs the query as the `authenticated` role so RLS actually applies
-- (as table owner / postgres, RLS is bypassed and this test would pass
-- vacuously). Self-contained fixture, rolled back at the end.

begin;
select plan(4);

insert into academic_years (label, starts_on, ends_on, is_current)
values ('test-rls-year', '2000-01-01', '2000-12-31', false);
-- is_current stays false to avoid colliding with any real "current" year;
-- student_current_class_id() only matters for the students-table policy,
-- which this test doesn't exercise, so it's fine that this year is never
-- "current".

insert into grades (number, name) values (95, 'Test RLS Grade');

insert into classes (grade_id, academic_year_id, name)
select (select id from grades where number = 95),
       (select id from academic_years where label = 'test-rls-year'),
       x.name
from (values ('TestRLS-4B'), ('TestRLS-4C')) as x(name);

insert into roles (key, name) values ('test_rls_class_teacher', 'Test RLS Class Teacher')
on conflict (key) do nothing;
insert into role_permissions (role_id, permission_key)
select id, 'student.view_full' from roles where key = 'test_rls_class_teacher'
on conflict do nothing;

insert into staff (staff_no, full_name, phone, auth_user_id)
values ('TEST-RLS-TEACHER', 'Test RLS Teacher', '0000000099', gen_random_uuid());

insert into staff_roles (staff_id, role_id, scope_type, scope_id)
select (select id from staff where staff_no = 'TEST-RLS-TEACHER'),
       (select id from roles where key = 'test_rls_class_teacher'),
       'class',
       (select id from classes where name = 'TestRLS-4B');

insert into students (admission_no, full_name) values
  ('TEST-RLS-STU-4B', 'Student In 4B'),
  ('TEST-RLS-STU-4C', 'Student In 4C');

insert into student_enrolments (student_id, class_id, academic_year_id)
select (select id from students where admission_no = 'TEST-RLS-STU-4B'),
       (select id from classes where name = 'TestRLS-4B'),
       (select id from academic_years where label = 'test-rls-year')
union all
select (select id from students where admission_no = 'TEST-RLS-STU-4C'),
       (select id from classes where name = 'TestRLS-4C'),
       (select id from academic_years where label = 'test-rls-year');

-- Act as the class teacher: set the JWT claim auth.uid() reads, then
-- switch to the authenticated role so RLS is actually enforced.
select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-RLS-TEACHER'), true);
set local role authenticated;

select is(
  (select count(*)::int from student_enrolments where class_id = (select id from classes where name = 'TestRLS-4B')),
  1,
  'class teacher sees the one enrolment in their own class'
);
select is(
  (select count(*)::int from student_enrolments where class_id = (select id from classes where name = 'TestRLS-4C')),
  0,
  'class teacher sees zero enrolments in a class they do not teach, even when explicitly filtering for it'
);
select is(
  (select count(*)::int from student_enrolments),
  1,
  'an unfiltered query over all enrolments still returns only the teacher''s own class'
);

reset role;
select is(
  (select count(*)::int from student_enrolments),
  2,
  'sanity check: both enrolments exist and are visible again once back to an elevated role'
);

select * from finish();
rollback;
