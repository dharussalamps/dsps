-- pgTAP test for check_rate_limit() (build task 23: rate limiting).

begin;
select plan(4);

insert into staff (staff_no, full_name, phone, auth_user_id) values ('TEST-RATE-STAFF', 'Test Rate Staff', '0000000091', gen_random_uuid());
select set_config('request.jwt.claim.sub', (select auth_user_id::text from staff where staff_no = 'TEST-RATE-STAFF'), true);
set local role authenticated;

select ok(
  check_rate_limit('test_action', 2, interval '1 minute'),
  'first call within the limit succeeds'
);
select ok(
  check_rate_limit('test_action', 2, interval '1 minute'),
  'second call within the limit succeeds'
);
select ok(
  not check_rate_limit('test_action', 2, interval '1 minute'),
  'third call exceeding a limit of 2 is blocked'
);
select ok(
  check_rate_limit('a_different_action', 2, interval '1 minute'),
  'a different action key has its own independent limit'
);

select * from finish();
rollback;
