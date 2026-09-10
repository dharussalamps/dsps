-- pgTAP test for AdminSpec.md section 15 open decision #1's admin/principal
-- bulk-mark path: someone holding attendance.mark_staff can set any staff
-- member's attendance in one call; someone without it cannot, even for a
-- colleague they can otherwise see on the board.

begin;
select plan(6);

insert into roles (key, name) values ('test_mark_staff_admin', 'Test Mark Staff Admin')
on conflict (key) do nothing;
insert into role_permissions (role_id, permission_key)
select id, 'attendance.mark_staff' from roles where key = 'test_mark_staff_admin'
on conflict do nothing;

insert into staff (staff_no, full_name, phone, auth_user_id) values
  ('TEST-MARKSTAFF-ADMIN',  'Test Mark Staff Admin',  '0000000093', gen_random_uuid()),
  ('TEST-MARKSTAFF-PLAIN',  'Test Mark Staff Plain',  '0000000092', gen_random_uuid()),
  ('TEST-MARKSTAFF-TARGET', 'Test Mark Staff Target', '0000000091', gen_random_uuid());

insert into staff_roles (staff_id, role_id, scope_type, scope_id)
select (select id from staff where staff_no = 'TEST-MARKSTAFF-ADMIN'),
       (select id from roles where key = 'test_mark_staff_admin'), 'school', null;

-- A plain staff member (no attendance.mark_staff) cannot mark a colleague.
select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-MARKSTAFF-PLAIN'), true);
set local role authenticated;

select throws_matching(
  format(
    $$ select mark_staff_attendance_bulk('2099-07-01', '[{"staff_id":"%s","status":"present"}]'::jsonb) $$,
    (select id from staff where staff_no = 'TEST-MARKSTAFF-TARGET')
  ),
  'not_authorized',
  'a staff member without attendance.mark_staff cannot bulk-mark another staff member'
);
select is(
  (select count(*) from staff_attendance where staff_id = (select id from staff where staff_no = 'TEST-MARKSTAFF-TARGET') and on_date = '2099-07-01'),
  0::bigint,
  'no row was written by the rejected call'
);

reset role;

-- The admin role can mark several staff at once, including a status other
-- than present/late (which self check-in can never write).
select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-MARKSTAFF-ADMIN'), true);
set local role authenticated;

select lives_ok(
  format(
    $$ select mark_staff_attendance_bulk('2099-07-01', '[{"staff_id":"%s","status":"present"},{"staff_id":"%s","status":"absent"}]'::jsonb) $$,
    (select id from staff where staff_no = 'TEST-MARKSTAFF-ADMIN'),
    (select id from staff where staff_no = 'TEST-MARKSTAFF-TARGET')
  ),
  'attendance.mark_staff holder can bulk-mark multiple staff, including itself, in one call'
);
select is(
  (select status::text from staff_attendance where staff_id = (select id from staff where staff_no = 'TEST-MARKSTAFF-TARGET') and on_date = '2099-07-01'),
  'absent',
  'the target staff member was marked absent'
);

-- Re-running with a different status upserts rather than duplicating the row.
select lives_ok(
  format(
    $$ select mark_staff_attendance_bulk('2099-07-01', '[{"staff_id":"%s","status":"late"}]'::jsonb) $$,
    (select id from staff where staff_no = 'TEST-MARKSTAFF-TARGET')
  ),
  're-marking the same staff/date upserts'
);
select is(
  (select status::text from staff_attendance where staff_id = (select id from staff where staff_no = 'TEST-MARKSTAFF-TARGET') and on_date = '2099-07-01'),
  'late',
  'the row was updated in place, not duplicated'
);

select * from finish();
rollback;
