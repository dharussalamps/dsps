-- pgTAP test for set_leave_balances_for_all(): applies one entitled value
-- to every active staff member's balance for a leave type/year in one call,
-- without disturbing an inactive staff member or an already-consumed balance.

begin;
select plan(4);

insert into academic_years (label, starts_on, ends_on, is_current)
values ('test-bulk-alloc-year', '2099-01-01', '2099-12-31', false)
on conflict do nothing;

insert into roles (key, name) values ('test_bulk_alloc_principal', 'Test Bulk Alloc Principal')
on conflict (key) do nothing;
insert into role_permissions (role_id, permission_key)
select id, 'leave.approve' from roles where key = 'test_bulk_alloc_principal'
on conflict do nothing;

insert into staff (staff_no, full_name, phone, auth_user_id, status) values
  ('TEST-BULK-PRINCIPAL', 'Test Bulk Alloc Principal', '0000000091', gen_random_uuid(), 'active'),
  ('TEST-BULK-TEACHER-A',  'Test Bulk Teacher A',       '0000000090', gen_random_uuid(), 'active'),
  ('TEST-BULK-TEACHER-B',  'Test Bulk Teacher B',       '0000000089', gen_random_uuid(), 'active'),
  ('TEST-BULK-INACTIVE',   'Test Bulk Inactive Staff',  '0000000088', gen_random_uuid(), 'inactive');

insert into staff_roles (staff_id, role_id, scope_type, scope_id)
select (select id from staff where staff_no = 'TEST-BULK-PRINCIPAL'),
       (select id from roles where key = 'test_bulk_alloc_principal'), 'school', null;

insert into leave_types (key, name, annual_entitlement) values ('test_bulk_alloc_type', 'Test Bulk Alloc Type', 10)
on conflict (key) do nothing;

-- Teacher A already has some days used — a bulk re-allocation must not
-- reset that.
insert into leave_balances (staff_id, leave_type_id, academic_year_id, entitled, used)
values (
  (select id from staff where staff_no = 'TEST-BULK-TEACHER-A'),
  (select id from leave_types where key = 'test_bulk_alloc_type'),
  (select id from academic_years where label = 'test-bulk-alloc-year'),
  10, 4
);

-- Act as the principal.
select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-BULK-PRINCIPAL'), true);
set local role authenticated;

select is(
  (select set_leave_balances_for_all(
    (select id from leave_types where key = 'test_bulk_alloc_type'),
    (select id from academic_years where label = 'test-bulk-alloc-year'),
    7
  ))::int,
  3,
  'bulk allocation touches exactly the 3 active staff'
);
select is(
  (select entitled from leave_balances
   where staff_id = (select id from staff where staff_no = 'TEST-BULK-TEACHER-B')
     and leave_type_id = (select id from leave_types where key = 'test_bulk_alloc_type')
     and academic_year_id = (select id from academic_years where label = 'test-bulk-alloc-year'))::numeric,
  7.0,
  'a staff member with no prior balance row gets one, entitled to the bulk value'
);
select is(
  (select (entitled, used) from leave_balances
   where staff_id = (select id from staff where staff_no = 'TEST-BULK-TEACHER-A')
     and leave_type_id = (select id from leave_types where key = 'test_bulk_alloc_type')
     and academic_year_id = (select id from academic_years where label = 'test-bulk-alloc-year'))::text,
  '(7,4)',
  'a staff member with used days keeps them, only entitled changes'
);
select is(
  (select count(*) from leave_balances
   where staff_id = (select id from staff where staff_no = 'TEST-BULK-INACTIVE')
     and leave_type_id = (select id from leave_types where key = 'test_bulk_alloc_type')),
  0::bigint,
  'an inactive staff member is left untouched'
);

select * from finish();
rollback;
