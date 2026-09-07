-- pgTAP test for AdminSpec.md section 11: "Given approval of a class
-- teacher's leave with no cover nominated, then the request cannot be
-- approved until a cover teacher is chosen or the principal explicitly
-- acknowledges none is needed."

begin;
select plan(5);

-- approve_leave() resolves the "current" academic year to attach the
-- balance row to; make that deterministic regardless of whatever's
-- already seeded, safely reverted by this test's rollback.
update academic_years set is_current = false where is_current;
insert into academic_years (label, starts_on, ends_on, is_current)
values ('test-leave-year', '2099-01-01', '2099-12-31', true);
insert into grades (number, name) values (98, 'Test Leave Grade');
insert into classes (grade_id, academic_year_id, name)
select (select id from grades where number = 98),
       (select id from academic_years where label = 'test-leave-year'),
       'TestLeaveClass';

insert into roles (key, name) values ('test_leave_principal', 'Test Leave Principal')
on conflict (key) do nothing;
insert into role_permissions (role_id, permission_key)
select id, 'leave.approve' from roles where key = 'test_leave_principal'
on conflict do nothing;

insert into staff (staff_no, full_name, phone, auth_user_id) values
  ('TEST-LEAVE-PRINCIPAL', 'Test Leave Principal', '0000000096', gen_random_uuid()),
  ('TEST-LEAVE-TEACHER',   'Test Leave Teacher',   '0000000095', gen_random_uuid()),
  ('TEST-LEAVE-COVER',     'Test Leave Cover',     '0000000094', gen_random_uuid());

update classes set class_teacher_id = (select id from staff where staff_no = 'TEST-LEAVE-TEACHER')
  where name = 'TestLeaveClass';

insert into staff_roles (staff_id, role_id, scope_type, scope_id)
select (select id from staff where staff_no = 'TEST-LEAVE-PRINCIPAL'),
       (select id from roles where key = 'test_leave_principal'), 'school', null;

insert into leave_types (key, name, annual_entitlement) values ('test_leave_type', 'Test Leave Type', 10)
on conflict (key) do nothing;

insert into leave_requests (staff_id, leave_type_id, starts_on, ends_on, day_count, reason)
values (
  (select id from staff where staff_no = 'TEST-LEAVE-TEACHER'),
  (select id from leave_types where key = 'test_leave_type'),
  '2099-07-01', '2099-07-02', 2, 'Test reason'
);

-- Act as the principal.
select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-LEAVE-PRINCIPAL'), true);
set local role authenticated;

select throws_matching(
  $$ select approve_leave((select id from leave_requests where reason = 'Test reason'), null, false) $$,
  'cover_required',
  'approving a class teacher''s leave with no cover and no acknowledgement is blocked'
);
select is(
  (select status::text from leave_requests where reason = 'Test reason'),
  'pending',
  'the blocked request is still pending'
);

-- Explicitly acknowledging "no cover needed" succeeds.
select lives_ok(
  $$ select approve_leave((select id from leave_requests where reason = 'Test reason'), null, true) $$,
  'approving with cover_not_needed = true succeeds'
);
select is(
  (select status::text from leave_requests where reason = 'Test reason'),
  'approved',
  'the request is now approved'
);
select is(
  (select used from leave_balances
   where staff_id = (select id from staff where staff_no = 'TEST-LEAVE-TEACHER')
     and leave_type_id = (select id from leave_types where key = 'test_leave_type'))::numeric,
  2.0,
  'the leave balance was debited by day_count'
);

select * from finish();
rollback;
