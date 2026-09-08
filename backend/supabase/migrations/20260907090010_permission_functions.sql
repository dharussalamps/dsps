-- AdminSpec.md section 5.3 — scope resolution.
-- These two functions are the enforcement point for every RLS policy in
-- the system (added table-by-table in build task 4). Never reimplement
-- this logic client-side; permissions.ts on the client only mirrors it for
-- display (hiding controls the server would reject anyway).

-- FR-AUTH-06 / NFR-SEC-06: a deactivated account must lose access, not just
-- fail future sign-ins. current_staff_id() is the resolution point for
-- every RLS policy and has_permission() call in the system, so restricting
-- it to active staff here is sufficient to fail every subsequent request
-- closed for a deactivated user, even one holding an already-valid session
-- token — there is no separate "is this session still allowed" check
-- anywhere else to patch. This is what makes "existing sessions end within
-- one minute" true in practice: the client's own periodic session-liveness
-- check (see assert_active_session(), added alongside this fix) forces a
-- local sign-out the next time it polls, but even without that poll, every
-- read and write this user attempts returns empty/denied immediately.
create or replace function current_staff_id()
returns uuid
language sql
stable
as $$
  select id from staff where auth_user_id = auth.uid() and status = 'active';
$$;

-- Lets an authenticated client cheaply ask "is my account still active" so
-- it can force a local sign-out promptly rather than only discovering
-- deactivation the next time some unrelated query happens to come back
-- empty. Distinct from current_staff_id(): that one is used *inside* RLS
-- expressions and must stay minimal; this one is the client-facing check.
create or replace function assert_active_session()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from staff where auth_user_id = auth.uid() and status = 'active'
  );
$$;

grant execute on function assert_active_session() to authenticated;

-- Deviation from AdminSpec.md section 5.3 as written, noted in section 17:
-- the spec's scope_type enum includes 'self' (used by the base 'staff'
-- role, and documented as the default scope for leave.request) but the
-- WHERE clause given in section 5.3 only ever matches 'school', 'grade' or
-- 'class' — a 'self'-scoped grant could never match, so a plain staff
-- member's staff.view_directory/leave.request would silently never work.
-- 'self' is treated here like 'school' (the grant applies regardless of
-- p_class_id): has_permission() answers "does this staff member hold this
-- permission at all", not "only over their own records" — that narrower
-- restriction is enforced separately, by each table's RLS policy checking
-- e.g. `staff_id = current_staff_id()`, the same way ownership is already
-- checked for things like "my own leave requests".
create or replace function has_permission(
  p_staff_id uuid,
  p_permission text,
  p_class_id uuid default null
) returns boolean language sql stable as $$
  select exists (
    select 1
    from staff_roles sr
    join role_permissions rp on rp.role_id = sr.role_id
    left join classes c on c.id = p_class_id
    where sr.staff_id = p_staff_id
      and sr.revoked_at is null
      and rp.permission_key = p_permission
      and (
            sr.scope_type in ('school', 'self')
        or (sr.scope_type = 'grade' and c.grade_id = sr.scope_id)
        or (sr.scope_type = 'class' and c.id       = sr.scope_id)
      )
  )
  or exists (
    -- an active cover assignment grants class-teacher rights over that class
    select 1 from cover_assignments ca
    join roles r on r.key = 'class_teacher'
    join role_permissions rp2 on rp2.role_id = r.id
    where ca.staff_id = p_staff_id
      and ca.class_id = p_class_id
      and current_date between ca.starts_on and ca.ends_on
      and rp2.permission_key = p_permission
  );
$$;

-- Both functions run inside RLS policy expressions, evaluated as the
-- querying role — they must be directly executable by that role or every
-- policy referencing them fails closed with a permission error.
grant execute on function current_staff_id() to authenticated;
grant execute on function has_permission(uuid, text, uuid) to authenticated;
