-- pgTAP test for import_students() (AdminSpec.md section 8/build task 5):
-- one call can report a mix of accepted and rejected rows (a duplicate
-- admission_no fails its own insert) while every accepted row's data
-- still lands, proving the per-row savepoint actually isolates failures
-- rather than the whole call succeeding or failing as one unit.

begin;
select plan(6);

-- import_students() is restricted to the seeded 'administrator'/'principal'
-- roles specifically (see 20260910100000_student_create_admin_principal_only.sql),
-- not just any role holding 'student.edit' — so, unlike the other pgTAP
-- tests in this suite, this one deliberately uses the real seeded
-- 'administrator' role rather than an isolated test_* role.
insert into staff (staff_no, full_name, phone, auth_user_id) values ('TEST-IMPORT-ADMIN', 'Test Import Admin', '0000000092', gen_random_uuid());
insert into staff_roles (staff_id, role_id, scope_type, scope_id)
select (select id from staff where staff_no = 'TEST-IMPORT-ADMIN'), (select id from roles where key = 'administrator'), 'school', null;

-- A vice_principal holds 'student.edit' too (seed/003_role_permissions.sql)
-- but must NOT be able to create/import students — only administrator and
-- principal may.
insert into staff (staff_no, full_name, phone, auth_user_id) values ('TEST-IMPORT-VP', 'Test Import VP', '0000000093', gen_random_uuid());
insert into staff_roles (staff_id, role_id, scope_type, scope_id)
select (select id from staff where staff_no = 'TEST-IMPORT-VP'), (select id from roles where key = 'vice_principal'), 'school', null;

-- A duplicate admission_no already exists before the import runs.
insert into students (admission_no, full_name) values ('TEST-IMPORT-DUP', 'Existing Student');

select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-IMPORT-ADMIN'), true);
set local role authenticated;

select * from import_students(
  jsonb_build_array(
    jsonb_build_object('admission_no', 'TEST-IMPORT-NEW-1', 'full_name', 'New Student One'),
    jsonb_build_object('admission_no', 'TEST-IMPORT-DUP', 'full_name', 'Should Fail'),
    jsonb_build_object('admission_no', 'TEST-IMPORT-NEW-2', 'full_name', 'New Student Two')
  )
);

select is(
  (select count(*)::int from students where admission_no = 'TEST-IMPORT-NEW-1'),
  1,
  'the first valid row was committed'
);
select is(
  (select count(*)::int from students where admission_no = 'TEST-IMPORT-NEW-2'),
  1,
  'the row after the failing one was still committed (per-row savepoint, not whole-call rollback)'
);
select is(
  (select full_name from students where admission_no = 'TEST-IMPORT-DUP'),
  'Existing Student',
  'the pre-existing row was untouched by the rejected duplicate'
);
select is(
  (select count(*)::int from students where admission_no = 'TEST-IMPORT-DUP'),
  1,
  'the rejected row did not create a duplicate'
);

select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-IMPORT-VP'), true);
select throws_ok(
  $$select * from import_students(jsonb_build_array(jsonb_build_object('admission_no', 'TEST-IMPORT-VP-BLOCKED', 'full_name', 'Blocked Student')))$$,
  '42501',
  'forbidden',
  'a vice_principal (student.edit, but not principal/administrator) cannot import students'
);
select is(
  (select count(*)::int from students where admission_no = 'TEST-IMPORT-VP-BLOCKED'),
  0,
  'the blocked row was not created'
);

select * from finish();
rollback;
