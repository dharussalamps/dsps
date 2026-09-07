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
            sr.scope_type = 'school'
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
