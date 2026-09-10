-- pgTAP test for the follow-up to section 15 open decision #1: today's
-- staff attendance is open to anyone holding attendance.mark_staff, but a
-- past date is locked for *everyone* — principal included — until a
-- staff_attendance_reopens row exists for it. attendance.reopen_staff
-- (principal only) gates *creating* that row via reopen_staff_attendance_day();
-- it is not itself a write bypass (20260910010000_staff_attendance_reopen_
-- required_for_all.sql tightened this from the previous migration, which
-- had let a reopen_staff holder write a past date directly).

begin;
select plan(6);

insert into roles (key, name) values
  ('test_lock_principal', 'Test Lock Principal'),
  ('test_lock_admin', 'Test Lock Admin')
on conflict (key) do nothing;
insert into role_permissions (role_id, permission_key)
select id, 'attendance.mark_staff' from roles where key in ('test_lock_principal', 'test_lock_admin')
on conflict do nothing;
insert into role_permissions (role_id, permission_key)
select id, 'attendance.reopen_staff' from roles where key = 'test_lock_principal'
on conflict do nothing;

insert into staff (staff_no, full_name, phone, auth_user_id) values
  ('TEST-LOCK-PRINCIPAL', 'Test Lock Principal', '0000000090', gen_random_uuid()),
  ('TEST-LOCK-ADMIN',     'Test Lock Admin',     '0000000089', gen_random_uuid()),
  ('TEST-LOCK-TARGET',    'Test Lock Target',    '0000000088', gen_random_uuid());

insert into staff_roles (staff_id, role_id, scope_type, scope_id)
select (select id from staff where staff_no = 'TEST-LOCK-PRINCIPAL'), (select id from roles where key = 'test_lock_principal'), 'school', null
union all
select (select id from staff where staff_no = 'TEST-LOCK-ADMIN'), (select id from roles where key = 'test_lock_admin'), 'school', null;

-- An administrator (attendance.mark_staff but not attendance.reopen_staff)
-- can freely mark today...
select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-LOCK-ADMIN'), true);
set local role authenticated;

select lives_ok(
  format(
    $$ select mark_staff_attendance_bulk(current_date, '[{"staff_id":"%s","status":"present"}]'::jsonb) $$,
    (select id from staff where staff_no = 'TEST-LOCK-TARGET')
  ),
  'an administrator can mark today''s staff attendance'
);

-- ...but not a locked past date.
select throws_matching(
  format(
    $$ select mark_staff_attendance_bulk((current_date - 1), '[{"staff_id":"%s","status":"absent"}]'::jsonb) $$,
    (select id from staff where staff_no = 'TEST-LOCK-TARGET')
  ),
  'date_locked',
  'an administrator cannot mark a past date that has not been reopened'
);

reset role;

-- Nor can the principal — attendance.reopen_staff only unlocks the *reopen*
-- action, it is not a direct write bypass, even for the one role that holds it.
select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-LOCK-PRINCIPAL'), true);
set local role authenticated;

select throws_matching(
  format(
    $$ select mark_staff_attendance_bulk((current_date - 1), '[{"staff_id":"%s","status":"absent"}]'::jsonb) $$,
    (select id from staff where staff_no = 'TEST-LOCK-TARGET')
  ),
  'date_locked',
  'the principal cannot mark a past date directly either, without reopening it first'
);

-- The principal reopens that date — for everyone, including themselves.
select lives_ok(
  $$ select reopen_staff_attendance_day(current_date - 1) $$,
  'the principal can reopen a past date'
);
select lives_ok(
  format(
    $$ select mark_staff_attendance_bulk((current_date - 1), '[{"staff_id":"%s","status":"absent"}]'::jsonb) $$,
    (select id from staff where staff_no = 'TEST-LOCK-TARGET')
  ),
  'the principal can mark that date once it is reopened'
);

reset role;

-- Now the administrator can mark that same past date too.
select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-LOCK-ADMIN'), true);
set local role authenticated;

select lives_ok(
  format(
    $$ select mark_staff_attendance_bulk((current_date - 1), '[{"staff_id":"%s","status":"late"}]'::jsonb) $$,
    (select id from staff where staff_no = 'TEST-LOCK-TARGET')
  ),
  'once reopened, the administrator can mark that past date too'
);
select is(
  (select status::text from staff_attendance where staff_id = (select id from staff where staff_no = 'TEST-LOCK-TARGET') and on_date = current_date - 1),
  'late',
  'the reopened-date write took effect'
);

select * from finish();
rollback;
