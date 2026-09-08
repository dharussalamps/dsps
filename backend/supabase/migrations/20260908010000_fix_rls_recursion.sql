-- Fix: current_staff_id() and has_permission() are the access-control
-- primitive underlying nearly every RLS policy in this schema (see
-- 20260907090010_permission_functions.sql's own comment: "never
-- reimplement this logic client-side... the enforcement point for every
-- RLS policy"), but neither was declared security definer. Their own
-- internal queries (against staff / staff_roles / role_permissions /
-- cover_assignments / classes) were therefore themselves subject to RLS —
-- and those tables' policies call straight back into current_staff_id()/
-- has_permission() (e.g. read_staff calls has_permission(current_staff_id(),
-- ...), which queries staff_roles, whose own read_staff_roles policy calls
-- has_permission(current_staff_id(), 'account.manage') again). The result:
-- every query against any RLS-protected table recurses until Postgres hits
-- max_stack_depth ("stack depth limit exceeded"), for anon and
-- authenticated callers alike, confirmed directly against the hosted
-- project. Marking both security definer (owned by the migration role,
-- which owns every table here) makes their internal lookups run as the
-- table owner, which bypasses RLS by default and breaks the cycle.
-- search_path is pinned to prevent search_path hijacking of a security
-- definer function.
create or replace function current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from staff where auth_user_id = auth.uid() and status = 'active';
$$;

create or replace function has_permission(
  p_staff_id uuid,
  p_permission text,
  p_class_id uuid default null
) returns boolean language sql stable security definer set search_path = public as $$
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

grant execute on function current_staff_id() to authenticated;
grant execute on function has_permission(uuid, text, uuid) to authenticated;
