-- pgTAP test for set_leave_balance(): only leave.approve holders may set a
-- staff member's entitled leave days, and re-allocating never resets used.

begin;
select plan(4);

insert into academic_years (label, starts_on, ends_on, is_current)
values ('test-alloc-year', '2099-01-01', '2099-12-31', false)
on conflict do nothing;

insert into roles (key, name) values ('test_alloc_principal', 'Test Alloc Principal')
on conflict (key) do nothing;
insert into role_permissions (role_id, permission_key)
select id, 'leave.approve' from roles where key = 'test_alloc_principal'
on conflict do nothing;

insert into staff (staff_no, full_name, phone, auth_user_id) values
  ('TEST-ALLOC-PRINCIPAL', 'Test Alloc Principal', '0000000093', gen_random_uuid()),
  ('TEST-ALLOC-TEACHER',   'Test Alloc Teacher',   '0000000092', gen_random_uuid());

insert into staff_roles (staff_id, role_id, scope_type, scope_id)
select (select id from staff where staff_no = 'TEST-ALLOC-PRINCIPAL'),
       (select id from roles where key = 'test_alloc_principal'), 'school', null;

insert into leave_types (key, name, annual_entitlement) values ('test_alloc_type', 'Test Alloc Type', 10)
on conflict (key) do nothing;

-- Act as the teacher, who holds no leave.approve grant.
select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-ALLOC-TEACHER'), true);
set local role authenticated;

select throws_matching(
  $$ select set_leave_balance(
    (select id from staff where staff_no = 'TEST-ALLOC-TEACHER'),
    (select id from leave_types where key = 'test_alloc_type'),
    (select id from academic_years where label = 'test-alloc-year'),
    12
  ) $$,
  'forbidden',
  'a staff member without leave.approve cannot allocate a balance'
);

-- Act as the principal.
select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-ALLOC-PRINCIPAL'), true);
set local role authenticated;

select lives_ok(
  $$ select set_leave_balance(
    (select id from staff where staff_no = 'TEST-ALLOC-TEACHER'),
    (select id from leave_types where key = 'test_alloc_type'),
    (select id from academic_years where label = 'test-alloc-year'),
    12
  ) $$,
  'the principal can allocate a balance'
);
select is(
  (select entitled from leave_balances
   where staff_id = (select id from staff where staff_no = 'TEST-ALLOC-TEACHER')
     and leave_type_id = (select id from leave_types where key = 'test_alloc_type')
     and academic_year_id = (select id from academic_years where label = 'test-alloc-year'))::numeric,
  12.0,
  'entitled was set to the allocated value'
);

-- Simulate a prior approval having consumed some of the balance, then
-- re-allocate: used must survive the re-allocation.
update leave_balances set used = 3
where staff_id = (select id from staff where staff_no = 'TEST-ALLOC-TEACHER')
  and leave_type_id = (select id from leave_types where key = 'test_alloc_type')
  and academic_year_id = (select id from academic_years where label = 'test-alloc-year');

select set_leave_balance(
  (select id from staff where staff_no = 'TEST-ALLOC-TEACHER'),
  (select id from leave_types where key = 'test_alloc_type'),
  (select id from academic_years where label = 'test-alloc-year'),
  15
);
select is(
  (select (entitled, used) from leave_balances
   where staff_id = (select id from staff where staff_no = 'TEST-ALLOC-TEACHER')
     and leave_type_id = (select id from leave_types where key = 'test_alloc_type')
     and academic_year_id = (select id from academic_years where label = 'test-alloc-year'))::text,
  '(15,3)',
  're-allocating updates entitled without resetting used'
);

select * from finish();
rollback;
