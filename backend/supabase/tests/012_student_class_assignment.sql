-- pgTAP test for set_student_class() / remove_student_from_class() /
-- list_unassigned_students() (20260910110000_student_class_assignment.sql):
-- a student created without a class can be given one, a student can be
-- taken out of a class again, and both are gated on 'student.edit' like
-- every other existing-record edit (set_student_status() is the precedent
-- this mirrors).

begin;
select plan(8);

-- Both RPCs resolve "current" academic year; make that deterministic
-- regardless of whatever's already seeded, safely reverted by rollback.
update academic_years set is_current = false where is_current;
insert into academic_years (label, starts_on, ends_on, is_current)
values ('test-setclass-year', '2099-01-01', '2099-12-31', true);
insert into grades (number, name) values (97, 'Test SetClass Grade');
insert into classes (grade_id, academic_year_id, name)
select (select id from grades where number = 97),
       (select id from academic_years where label = 'test-setclass-year'),
       'TestSetClassRoom';

insert into roles (key, name) values ('test_setclass_editor', 'Test SetClass Editor')
on conflict (key) do nothing;
-- Paired with student.view_full the way every real role holding
-- student.edit does (seed/003_role_permissions.sql) — list_unassigned_students()
-- selects from students under RLS's ordinary read_students policy (it isn't
-- security definer), so student.edit alone would see zero rows to assign.
insert into role_permissions (role_id, permission_key)
select id, perm from roles, unnest(array['student.edit', 'student.view_full']) as perm
where roles.key = 'test_setclass_editor'
on conflict do nothing;

insert into staff (staff_no, full_name, phone, auth_user_id) values
  ('TEST-SETCLASS-EDITOR', 'Test SetClass Editor', '0000000091', gen_random_uuid()),
  ('TEST-SETCLASS-NOPERM', 'Test SetClass No Perm', '0000000090', gen_random_uuid());

insert into staff_roles (staff_id, role_id, scope_type, scope_id)
select (select id from staff where staff_no = 'TEST-SETCLASS-EDITOR'),
       (select id from roles where key = 'test_setclass_editor'), 'school', null;

insert into students (admission_no, full_name) values
  ('TEST-SETCLASS-UNASSIGNED', 'Unassigned Student'),
  ('TEST-SETCLASS-ALREADY', 'Already Enrolled Student');

insert into student_enrolments (student_id, class_id, academic_year_id)
select (select id from students where admission_no = 'TEST-SETCLASS-ALREADY'),
       (select id from classes where name = 'TestSetClassRoom'),
       (select id from academic_years where label = 'test-setclass-year');

select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-SETCLASS-EDITOR'), true);
set local role authenticated;

select ok(
  exists(select 1 from list_unassigned_students() where admission_no = 'TEST-SETCLASS-UNASSIGNED'),
  'the unassigned student is listed'
);
select ok(
  not exists(select 1 from list_unassigned_students() where admission_no = 'TEST-SETCLASS-ALREADY'),
  'the already-enrolled student is not listed'
);

select set_student_class(
  (select id from students where admission_no = 'TEST-SETCLASS-UNASSIGNED'),
  (select id from classes where name = 'TestSetClassRoom')
);
select is(
  (select count(*)::int from student_enrolments where student_id = (select id from students where admission_no = 'TEST-SETCLASS-UNASSIGNED')),
  1,
  'set_student_class() created the enrolment'
);
select ok(
  not exists(select 1 from list_unassigned_students() where admission_no = 'TEST-SETCLASS-UNASSIGNED'),
  'the student no longer appears as unassigned once given a class'
);

select remove_student_from_class((select id from students where admission_no = 'TEST-SETCLASS-UNASSIGNED'));
select is(
  (select count(*)::int from student_enrolments where student_id = (select id from students where admission_no = 'TEST-SETCLASS-UNASSIGNED')),
  0,
  'remove_student_from_class() deleted the enrolment'
);
select ok(
  exists(select 1 from list_unassigned_students() where admission_no = 'TEST-SETCLASS-UNASSIGNED'),
  'the student is back on the unassigned list once removed from their class'
);

select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-SETCLASS-NOPERM'), true);
select throws_ok(
  $$select set_student_class(
      (select id from students where admission_no = 'TEST-SETCLASS-UNASSIGNED'),
      (select id from classes where name = 'TestSetClassRoom')
    )$$,
  '42501',
  'forbidden',
  'a staff member without student.edit cannot set a student''s class'
);
select throws_ok(
  $$select remove_student_from_class((select id from students where admission_no = 'TEST-SETCLASS-ALREADY'))$$,
  '42501',
  'forbidden',
  'a staff member without student.edit cannot remove a student from their class'
);

select * from finish();
rollback;
