-- classes.class_teacher_id (set from the Classes/Subjects/Terms screen) and
-- the staff_roles 'class_teacher' grant (set from the Accounts "Grant role"
-- screen) were two independent stores of the same fact with nothing keeping
-- them in sync: assigning a teacher on the Classes screen never created a
-- staff_roles row, and has_permission() (20260907090010) reads only from
-- staff_roles — so a class could show an assigned teacher while that
-- teacher actually held none of the class_teacher permissions, and the
-- Accounts screen would show far fewer "class teacher" assignments than the
-- Classes screen showed assigned classes. These two triggers keep both
-- directions in sync going forward; the backfill below reconciles existing
-- rows once.
--
-- classes.class_teacher_id is a single scalar per class, so the intended
-- model is one active class_teacher grant per class: assigning a new
-- teacher (either screen) revokes the previous holder's grant for that
-- class.

create or replace function sync_class_teacher_role_from_classes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
begin
  select id into v_role_id from roles where key = 'class_teacher';
  if v_role_id is null then
    return new;
  end if;

  -- Revoke any active grant for this class that no longer matches the
  -- assigned teacher (including all of them, if the class now has none).
  update staff_roles
     set revoked_at = now()
   where role_id = v_role_id
     and scope_type = 'class'
     and scope_id = new.id
     and revoked_at is null
     and (new.class_teacher_id is null or staff_id is distinct from new.class_teacher_id);

  -- Grant the newly assigned teacher, if they don't already hold an active
  -- grant for this class (e.g. it was set directly via the Accounts screen).
  if new.class_teacher_id is not null and not exists (
    select 1 from staff_roles
     where role_id = v_role_id
       and scope_type = 'class'
       and scope_id = new.id
       and staff_id = new.class_teacher_id
       and revoked_at is null
  ) then
    insert into staff_roles (staff_id, role_id, scope_type, scope_id, granted_by)
    values (new.class_teacher_id, v_role_id, 'class', new.id, current_staff_id());
  end if;

  return new;
end;
$$;

drop trigger if exists classes_sync_class_teacher_role on classes;
create trigger classes_sync_class_teacher_role
  after insert or update of class_teacher_id on classes
  for each row execute function sync_class_teacher_role_from_classes();

create or replace function sync_classes_from_class_teacher_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_key text;
begin
  select key into v_role_key from roles where id = new.role_id;
  if v_role_key is distinct from 'class_teacher' or new.scope_type is distinct from 'class' then
    return new;
  end if;

  if tg_op = 'INSERT' and new.revoked_at is null then
    update classes
       set class_teacher_id = new.staff_id
     where id = new.scope_id
       and class_teacher_id is distinct from new.staff_id;
  elsif tg_op = 'UPDATE' then
    if new.revoked_at is not null and old.revoked_at is null then
      -- This grant was just revoked: clear the class's assigned teacher,
      -- but only if it still points at the staff member being revoked
      -- (it may already have moved on to someone else).
      update classes
         set class_teacher_id = null
       where id = new.scope_id
         and class_teacher_id = new.staff_id;
    elsif new.revoked_at is null and old.revoked_at is not null then
      update classes
         set class_teacher_id = new.staff_id
       where id = new.scope_id
         and class_teacher_id is distinct from new.staff_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists staff_roles_sync_classes on staff_roles;
create trigger staff_roles_sync_classes
  after insert or update on staff_roles
  for each row execute function sync_classes_from_class_teacher_role();

-- Backfill: reconcile existing data once, before the triggers above take
-- over going forward.
do $$
declare
  v_role_id uuid;
begin
  select id into v_role_id from roles where key = 'class_teacher';
  if v_role_id is null then
    return;
  end if;

  -- 1. Where a class has more than one active class_teacher grant, keep
  --    only the one matching the class's current class_teacher_id (or, if
  --    none matches, the most recently granted one) and revoke the rest.
  with ranked as (
    select sr.id,
           row_number() over (
             partition by sr.scope_id
             order by (c.class_teacher_id = sr.staff_id) desc, sr.granted_at desc
           ) as rn
    from staff_roles sr
    join classes c on c.id = sr.scope_id
    where sr.role_id = v_role_id
      and sr.scope_type = 'class'
      and sr.revoked_at is null
  )
  update staff_roles
     set revoked_at = now()
   where id in (select id from ranked where rn > 1);

  -- 2. Where a class has no assigned teacher but an active class_teacher
  --    grant exists for it, adopt that grant's staff member as the class's
  --    assigned teacher.
  update classes c
     set class_teacher_id = sr.staff_id
    from staff_roles sr
   where sr.role_id = v_role_id
     and sr.scope_type = 'class'
     and sr.scope_id = c.id
     and sr.revoked_at is null
     and c.class_teacher_id is null;

  -- 3. Where a class has an assigned teacher but no matching active grant,
  --    create one (granted_by left null: there's no real actor for a
  --    historical assignment made before this migration).
  insert into staff_roles (staff_id, role_id, scope_type, scope_id)
  select c.class_teacher_id, v_role_id, 'class', c.id
    from classes c
   where c.class_teacher_id is not null
     and not exists (
       select 1 from staff_roles sr
        where sr.role_id = v_role_id
          and sr.scope_type = 'class'
          and sr.scope_id = c.id
          and sr.staff_id = c.class_teacher_id
          and sr.revoked_at is null
     );
end;
$$;
