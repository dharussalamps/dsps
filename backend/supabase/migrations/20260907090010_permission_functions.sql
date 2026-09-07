-- AdminSpec.md section 5.3 — scope resolution.
-- These two functions are the enforcement point for every RLS policy in
-- the system (added table-by-table in build task 4). Never reimplement
-- this logic client-side; permissions.ts on the client only mirrors it for
-- display (hiding controls the server would reject anyway).

create or replace function current_staff_id()
returns uuid
language sql
stable
as $$
  select id from staff where auth_user_id = auth.uid();
$$;

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
