-- pgTAP test for close_staff_attendance_day(): a principal can lock a
-- previously-reopened past date back up (mirrors 010_staff_attendance_day_
-- lock.sql's reopen coverage), and once closed, attendance.mark_staff
-- holders without attendance.reopen_staff can no longer write to it.

begin;
select plan(4);

insert into roles (key, name) values
  ('test_close_principal', 'Test Close Principal'),
  ('test_close_admin', 'Test Close Admin')
on conflict (key) do nothing;
insert into role_permissions (role_id, permission_key)
select id, 'attendance.mark_staff' from roles where key in ('test_close_principal', 'test_close_admin')
on conflict do nothing;
insert into role_permissions (role_id, permission_key)
select id, 'attendance.reopen_staff' from roles where key = 'test_close_principal'
on conflict do nothing;

insert into staff (staff_no, full_name, phone, auth_user_id) values
  ('TEST-CLOSE-PRINCIPAL', 'Test Close Principal', '0000000087', gen_random_uuid()),
  ('TEST-CLOSE-ADMIN',     'Test Close Admin',     '0000000086', gen_random_uuid()),
  ('TEST-CLOSE-TARGET',    'Test Close Target',    '0000000085', gen_random_uuid());

insert into staff_roles (staff_id, role_id, scope_type, scope_id)
select (select id from staff where staff_no = 'TEST-CLOSE-PRINCIPAL'), (select id from roles where key = 'test_close_principal'), 'school', null
union all
select (select id from staff where staff_no = 'TEST-CLOSE-ADMIN'), (select id from roles where key = 'test_close_admin'), 'school', null;

select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-CLOSE-PRINCIPAL'), true);
set local role authenticated;

select lives_ok(
  $$ select reopen_staff_attendance_day(current_date - 1) $$,
  'the principal reopens a past date'
);

reset role;
select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-CLOSE-ADMIN'), true);
set local role authenticated;

select lives_ok(
  format(
    $$ select mark_staff_attendance_bulk((current_date - 1), '[{"staff_id":"%s","status":"present"}]'::jsonb) $$,
    (select id from staff where staff_no = 'TEST-CLOSE-TARGET')
  ),
  'an administrator can mark the reopened date'
);

reset role;
select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-CLOSE-PRINCIPAL'), true);
set local role authenticated;

select lives_ok(
  $$ select close_staff_attendance_day(current_date - 1) $$,
  'the principal locks that date again'
);

reset role;
select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-CLOSE-ADMIN'), true);
set local role authenticated;

select throws_matching(
  format(
    $$ select mark_staff_attendance_bulk((current_date - 1), '[{"staff_id":"%s","status":"absent"}]'::jsonb) $$,
    (select id from staff where staff_no = 'TEST-CLOSE-TARGET')
  ),
  'date_locked',
  'once locked again, an administrator can no longer write to that date'
);

select * from finish();
rollback;
