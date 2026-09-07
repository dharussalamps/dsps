-- pgTAP test for AdminSpec.md section 11: "Given a submitted mark sheet,
-- when the teacher attempts to edit it, then the edit is rejected."

begin;
select plan(4);

insert into academic_years (label, starts_on, ends_on) values ('test-marks-year', '2099-01-01', '2099-12-31');
insert into terms (academic_year_id, name, sequence, starts_on, ends_on)
select id, 'Test Term', 1, '2099-01-01', '2099-12-31' from academic_years where label = 'test-marks-year';
insert into grades (number, name) values (99, 'Test Marks Grade');
insert into classes (grade_id, academic_year_id, name)
select (select id from grades where number = 99), (select id from academic_years where label = 'test-marks-year'), 'TestMarksClass';
insert into subjects (name, code) values ('Test Subject', 'TESTSUB');

insert into roles (key, name) values ('test_marks_teacher', 'Test Marks Teacher') on conflict (key) do nothing;
insert into role_permissions (role_id, permission_key) select id, 'marks.enter' from roles where key = 'test_marks_teacher' on conflict do nothing;

insert into staff (staff_no, full_name, phone, auth_user_id) values ('TEST-MARKS-TEACHER', 'Test Marks Teacher', '0000000093', gen_random_uuid());
insert into staff_roles (staff_id, role_id, scope_type, scope_id)
select (select id from staff where staff_no = 'TEST-MARKS-TEACHER'), (select id from roles where key = 'test_marks_teacher'),
       'class', (select id from classes where name = 'TestMarksClass');

insert into students (admission_no, full_name) values ('TEST-MARKS-STU', 'Test Marks Student');

insert into mark_sheets (class_id, subject_id, term_id)
select (select id from classes where name = 'TestMarksClass'), (select id from subjects where code = 'TESTSUB'),
       (select id from terms where academic_year_id = (select id from academic_years where label = 'test-marks-year'));

select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-MARKS-TEACHER'), true);
set local role authenticated;

insert into marks (mark_sheet_id, student_id, score, entered_by)
values (
  (select id from mark_sheets where class_id = (select id from classes where name = 'TestMarksClass')),
  (select id from students where admission_no = 'TEST-MARKS-STU'),
  75,
  (select id from staff where staff_no = 'TEST-MARKS-TEACHER')
);

select lives_ok(
  $$ select submit_mark_sheet((select id from mark_sheets where class_id = (select id from classes where name = 'TestMarksClass'))) $$,
  'the teacher can submit their own draft sheet'
);

select throws_ok(
  $$ update marks set score = 90
     where mark_sheet_id = (select id from mark_sheets where class_id = (select id from classes where name = 'TestMarksClass')) $$,
  null,
  null,
  'editing a mark on a submitted sheet is rejected (RLS: write_marks requires status = draft)'
);

select is(
  (select score from marks where student_id = (select id from students where admission_no = 'TEST-MARKS-STU'))::numeric,
  75,
  'the score was not changed'
);

select throws_matching(
  $$ select reopen_mark_sheet((select id from mark_sheets where class_id = (select id from classes where name = 'TestMarksClass'))) $$,
  'forbidden',
  'a class teacher (marks.enter only, not marks.reopen) cannot reopen the sheet themselves'
);

select * from finish();
rollback;
