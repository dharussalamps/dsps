-- pgTAP test for submit_attendance() (AdminSpec.md section 8/9). Covers
-- section 11's stated acceptance tests: a queued submission reaches the
-- server exactly once even if sync is triggered repeatedly, and a
-- conflicting second submission is rejected rather than silently merged.

begin;
select plan(6);

insert into calendar_days (on_date, day_type, label) values ('2099-06-16', 'school', 'Test School Day');

insert into academic_years (label, starts_on, ends_on)
values ('test-submit-year', '2099-01-01', '2099-12-31');
insert into grades (number, name) values (97, 'Test Submit Grade');
insert into classes (grade_id, academic_year_id, name)
select (select id from grades where number = 97),
       (select id from academic_years where label = 'test-submit-year'),
       'TestSubmitClass';

insert into roles (key, name) values ('test_submit_teacher', 'Test Submit Teacher')
on conflict (key) do nothing;
insert into role_permissions (role_id, permission_key)
select id, 'attendance.mark' from roles where key = 'test_submit_teacher'
on conflict do nothing;

insert into staff (staff_no, full_name, phone, auth_user_id)
values ('TEST-SUBMIT-TEACHER', 'Test Submit Teacher', '0000000097', gen_random_uuid());

insert into staff_roles (staff_id, role_id, scope_type, scope_id)
select (select id from staff where staff_no = 'TEST-SUBMIT-TEACHER'),
       (select id from roles where key = 'test_submit_teacher'),
       'class',
       (select id from classes where name = 'TestSubmitClass');

insert into students (admission_no, full_name) values
  ('TEST-SUBMIT-STU-1', 'Present Student'),
  ('TEST-SUBMIT-STU-2', 'Absent Student');

select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-SUBMIT-TEACHER'), true);
set local role authenticated;

-- First submission: creates the row.
select lives_ok(
  $$ select submit_attendance(
       (select id from classes where name = 'TestSubmitClass'),
       '2099-06-16'::date,
       jsonb_build_array(
         jsonb_build_object('student_id', (select id from students where admission_no = 'TEST-SUBMIT-STU-1'), 'status', 'present'),
         jsonb_build_object('student_id', (select id from students where admission_no = 'TEST-SUBMIT-STU-2'), 'status', 'absent')
       ),
       'test-device',
       '11111111-1111-1111-1111-111111111111'::uuid
     ) $$,
  'first submission succeeds'
);

select is(
  (select count(*)::int from student_attendance where class_id = (select id from classes where name = 'TestSubmitClass')),
  2,
  'both student_attendance rows were written'
);

-- Repeat with the SAME client_submission_id: idempotent replay, no duplicate rows.
select submit_attendance(
  (select id from classes where name = 'TestSubmitClass'),
  '2099-06-16'::date,
  jsonb_build_array(
    jsonb_build_object('student_id', (select id from students where admission_no = 'TEST-SUBMIT-STU-1'), 'status', 'present')
  ),
  'test-device',
  '11111111-1111-1111-1111-111111111111'::uuid
);
select is(
  (select count(*)::int from attendance_submissions where class_id = (select id from classes where name = 'TestSubmitClass')),
  1,
  'replaying the same client_submission_id does not create a second submission'
);
select is(
  (select count(*)::int from student_attendance where class_id = (select id from classes where name = 'TestSubmitClass')),
  2,
  'replaying the same client_submission_id does not touch student_attendance again'
);

-- A different client_submission_id for the same (class, on_date) is a conflict, not a merge.
select throws_matching(
  $$ select submit_attendance(
       (select id from classes where name = 'TestSubmitClass'),
       '2099-06-16'::date,
       jsonb_build_array(
         jsonb_build_object('student_id', (select id from students where admission_no = 'TEST-SUBMIT-STU-1'), 'status', 'late')
       ),
       'test-device-2',
       '22222222-2222-2222-2222-222222222222'::uuid
     ) $$,
  'already_submitted',
  'a second, independent submission for the same class/date is rejected'
);
select is(
  (select status::text from student_attendance where class_id = (select id from classes where name = 'TestSubmitClass') and student_id = (select id from students where admission_no = 'TEST-SUBMIT-STU-1')),
  'present',
  'the rejected conflicting submission did not overwrite the original mark'
);

select * from finish();
rollback;
