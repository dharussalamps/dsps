-- pgTAP test for delete_student() (20260912130000_delete_unassigned_student.sql):
-- a principal/administrator can permanently erase a student with no class
-- and no attendance history, but is refused for one currently in a class or
-- with attendance recorded, and a lesser role (student.edit only) is
-- refused outright regardless of the student's own state.

begin;
select plan(8);

insert into academic_years (label, starts_on, ends_on, is_current)
values ('test-deletestudent-year', '2098-01-01', '2098-12-31', false)
on conflict (label) do nothing;
update academic_years set is_current = true where label = 'test-deletestudent-year';

insert into grades (number, name) values (96, 'Test DeleteStudent Grade');
insert into classes (grade_id, academic_year_id, name)
select (select id from grades where number = 96),
       (select id from academic_years where label = 'test-deletestudent-year'),
       'TestDeleteStudentRoom';

-- A vice_principal holds 'student.edit' (seed/003_role_permissions.sql) but,
-- like import_students(), must not be able to delete a student either.
insert into staff (staff_no, full_name, phone, auth_user_id) values
  ('TEST-DELSTU-ADMIN', 'Test DeleteStudent Admin', '0000000094', gen_random_uuid()),
  ('TEST-DELSTU-VP', 'Test DeleteStudent VP', '0000000095', gen_random_uuid());

insert into staff_roles (staff_id, role_id, scope_type, scope_id)
select (select id from staff where staff_no = 'TEST-DELSTU-ADMIN'), (select id from roles where key = 'administrator'), 'school', null;
insert into staff_roles (staff_id, role_id, scope_type, scope_id)
select (select id from staff where staff_no = 'TEST-DELSTU-VP'), (select id from roles where key = 'vice_principal'), 'school', null;

insert into students (admission_no, full_name) values
  ('TEST-DELSTU-CLEAN', 'Clean Unassigned Student'),
  ('TEST-DELSTU-INCLASS', 'In Class Student'),
  ('TEST-DELSTU-ATTENDED', 'Attended Student');

insert into student_enrolments (student_id, class_id, academic_year_id)
select (select id from students where admission_no = 'TEST-DELSTU-INCLASS'),
       (select id from classes where name = 'TestDeleteStudentRoom'),
       (select id from academic_years where label = 'test-deletestudent-year');

-- TEST-DELSTU-ATTENDED has attendance but, unlike TEST-DELSTU-INCLASS, no
-- *current-year* enrolment — proving the attendance check is independent of
-- (and not bypassable by) the class-assignment check.
insert into student_attendance (student_id, class_id, on_date, status, marked_by)
select (select id from students where admission_no = 'TEST-DELSTU-ATTENDED'),
       (select id from classes where name = 'TestDeleteStudentRoom'),
       '2098-01-05',
       'present',
       (select id from staff where staff_no = 'TEST-DELSTU-ADMIN');

select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-DELSTU-ADMIN'), true);
set local role authenticated;

-- list_unassigned_students() (20260912140000_list_unassigned_students_has_attendance.sql)
-- flags has_attendance per row so the client can hide the delete icon
-- outright, rather than only refuse the RPC call after the fact.
select ok(
  (select has_attendance from list_unassigned_students() where admission_no = 'TEST-DELSTU-CLEAN') = false,
  'a student with no attendance is reported as has_attendance = false'
);
select ok(
  (select has_attendance from list_unassigned_students() where admission_no = 'TEST-DELSTU-ATTENDED') = true,
  'a student with attendance history is reported as has_attendance = true, even with no current class'
);

select throws_ok(
  $$select delete_student((select id from students where admission_no = 'TEST-DELSTU-INCLASS'))$$,
  'P0001',
  'This student is assigned to a class. Remove them from the class before deleting.',
  'a student currently in a class cannot be deleted'
);
select throws_ok(
  $$select delete_student((select id from students where admission_no = 'TEST-DELSTU-ATTENDED'))$$,
  'P0001',
  'This student has attendance records and cannot be deleted.',
  'a student with attendance history cannot be deleted, even without a current class'
);

select delete_student((select id from students where admission_no = 'TEST-DELSTU-CLEAN'));
select is(
  (select count(*)::int from students where admission_no = 'TEST-DELSTU-CLEAN'),
  0,
  'a student with no class and no attendance is deleted'
);
select ok(
  exists(
    select 1 from audit_log
    where entity = 'students' and action = 'delete'
      and before ->> 'admission_no' = 'TEST-DELSTU-CLEAN'
  ),
  'the deletion was written to the audit log with the deleted row captured'
);

select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-DELSTU-VP'), true);
select throws_ok(
  $$select delete_student((select id from students where admission_no = 'TEST-DELSTU-ATTENDED'))$$,
  '42501',
  'forbidden',
  'a vice_principal (student.edit, but not principal/administrator) cannot delete a student'
);
select is(
  (select count(*)::int from students where admission_no = 'TEST-DELSTU-ATTENDED'),
  1,
  'the blocked delete attempt left the student record untouched'
);

select * from finish();
rollback;
