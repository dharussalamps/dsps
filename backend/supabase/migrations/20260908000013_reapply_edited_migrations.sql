-- `supabase db push` tracks which migration *files* have been applied by
-- filename/timestamp — it does not diff file contents. Six migrations from
-- earlier phases (090010, 120001, 120002, 120003, 150001, 220001) were
-- edited in place during the Phase 17 SRS re-audit rather than only adding
-- new files, on the assumption (correct for every environment used until
-- now) that nothing had ever been pushed to a live project. This one had.
-- Since those six files' versions were already recorded as applied, `db
-- push` silently skipped re-running their new content — confirmed directly
-- against the live database (`approve_leave` still had 3 args, not 4;
-- `assert_active_session`/`can_view_staff_attendance`/
-- `can_publish_to_audience`/`notify_leave_request_submitted`/
-- `count_staff_on_leave` didn't exist at all). This migration replays
-- exactly the delta each of those six files added, so the live database
-- ends up in the same state a fresh `supabase db reset` would produce.
-- Idempotent throughout (CREATE OR REPLACE / DROP ... IF EXISTS), so it is
-- also safe to run again.

-- === from 20260907090010_permission_functions.sql ===
-- FR-AUTH-06 / NFR-SEC-06: current_staff_id() now excludes inactive staff
-- (same signature — no args — so CREATE OR REPLACE alone is sufficient,
-- no stale overload to drop).
create or replace function current_staff_id()
returns uuid
language sql
stable
as $$
  select id from staff where auth_user_id = auth.uid() and status = 'active';
$$;

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

-- === from 20260907120001_early_leave_staff_attendance.sql ===
-- FR-SAT-03 bug fix.
create or replace function can_view_staff_attendance(p_viewer uuid, p_target uuid)
returns boolean language sql stable as $$
  select
    p_viewer = p_target
    or exists (
      select 1 from staff_roles sr
      join role_permissions rp on rp.role_id = sr.role_id
      where sr.staff_id = p_viewer
        and sr.revoked_at is null
        and rp.permission_key = 'attendance.view_board'
        and sr.scope_type in ('school', 'self')
    )
    or exists (
      select 1
      from staff_roles viewer_sr
      join role_permissions rp on rp.role_id = viewer_sr.role_id
      where viewer_sr.staff_id = p_viewer
        and viewer_sr.revoked_at is null
        and rp.permission_key = 'attendance.view_board'
        and viewer_sr.scope_type = 'grade'
        and (
          exists (
            select 1 from staff_roles target_sr
            join classes c on c.id = target_sr.scope_id
            where target_sr.staff_id = p_target
              and target_sr.revoked_at is null
              and target_sr.scope_type = 'class'
              and c.grade_id = viewer_sr.scope_id
          )
          or exists (
            select 1 from cover_assignments ca
            join classes c on c.id = ca.class_id
            where ca.staff_id = p_target
              and current_date between ca.starts_on and ca.ends_on
              and c.grade_id = viewer_sr.scope_id
          )
        )
    );
$$;
grant execute on function can_view_staff_attendance(uuid, uuid) to authenticated;

drop policy if exists read_staff_attendance on staff_attendance;
create policy read_staff_attendance on staff_attendance for select
  using (can_view_staff_attendance(current_staff_id(), staff_id));

-- === from 20260907120002_leave.sql ===
-- FR-LVE-03.
create or replace function notify_leave_request_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester text;
  v_approver uuid;
begin
  select full_name into v_requester from staff where id = new.staff_id;
  for v_approver in
    select id from staff where status = 'active' and has_permission(id, 'leave.approve')
  loop
    insert into notifications (staff_id, type, title, body, payload)
    values (v_approver, 'leave.requested', 'New leave request',
      format('%s requested leave from %s to %s.', coalesce(v_requester, 'A staff member'), new.starts_on, new.ends_on),
      jsonb_build_object('leave_request_id', new.id, 'staff_id', new.staff_id));
  end loop;
  return new;
end;
$$;

drop trigger if exists leave_request_submitted on leave_requests;
create trigger leave_request_submitted
  after insert on leave_requests
  for each row execute function notify_leave_request_submitted();

-- FR-LVE-04.
create or replace function count_staff_on_leave(p_starts date, p_ends date, p_exclude_staff uuid)
returns integer
language sql
stable
as $$
  select count(distinct staff_id)::int
  from leave_requests
  where status = 'approved'
    and staff_id <> p_exclude_staff
    and starts_on <= p_ends
    and ends_on >= p_starts;
$$;
grant execute on function count_staff_on_leave(date, date, uuid) to authenticated;

-- === from 20260907120003_leave_decisions.sql ===
-- FR-LVE-07/10: approve_leave gained a 4th parameter (p_remarks), which
-- CREATE OR REPLACE treats as a distinct overload rather than replacing
-- the original 3-arg version — the stale one must be dropped explicitly so
-- the live database doesn't end up with both.
drop function if exists approve_leave(uuid, uuid, boolean);

create or replace function approve_leave(
  p_request_id uuid,
  p_cover_staff_id uuid default null,
  p_cover_not_needed boolean default false,
  p_remarks text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_class_id uuid;
  v_cover_assignment_id uuid;
  v_year_id uuid;
  v_entitled numeric(4,1);
  v_day date;
begin
  if not has_permission(current_staff_id(), 'leave.approve') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_request from leave_requests where id = p_request_id and status = 'pending';
  if v_request is null then
    raise exception 'not_pending' using errcode = 'P0003';
  end if;

  select id into v_class_id from classes where class_teacher_id = v_request.staff_id limit 1;
  if v_class_id is not null and p_cover_staff_id is null and not p_cover_not_needed then
    raise exception 'cover_required' using errcode = 'P0004';
  end if;

  if v_class_id is not null and p_cover_staff_id is not null then
    insert into cover_assignments (class_id, staff_id, starts_on, ends_on, reason, assigned_by)
    values (v_class_id, p_cover_staff_id, v_request.starts_on, v_request.ends_on, 'Covering approved leave', current_staff_id())
    returning id into v_cover_assignment_id;
  end if;

  update leave_requests
  set status = 'approved',
      decided_by = current_staff_id(),
      decided_at = now(),
      cover_assignment_id = v_cover_assignment_id,
      cover_not_needed = p_cover_not_needed,
      remarks = p_remarks
  where id = p_request_id;

  select id into v_year_id from academic_years where is_current;
  select annual_entitlement into v_entitled from leave_types where id = v_request.leave_type_id;

  insert into leave_balances (staff_id, leave_type_id, academic_year_id, entitled, used)
  values (v_request.staff_id, v_request.leave_type_id, v_year_id, coalesce(v_entitled, 0), v_request.day_count)
  on conflict (staff_id, leave_type_id, academic_year_id)
  do update set used = leave_balances.used + v_request.day_count;

  v_day := v_request.starts_on;
  while v_day <= v_request.ends_on loop
    insert into staff_attendance (staff_id, on_date, status)
    values (v_request.staff_id, v_day, 'on_leave')
    on conflict (staff_id, on_date) do update set status = 'on_leave';
    v_day := v_day + 1;
  end loop;

  perform write_audit_log('approve', 'leave_requests', p_request_id, null,
    jsonb_build_object('cover_assignment_id', v_cover_assignment_id, 'cover_not_needed', p_cover_not_needed, 'remarks', p_remarks));

  insert into notifications (staff_id, type, title, body, payload)
  values (v_request.staff_id, 'leave.approved', 'Leave approved',
    case when p_remarks is not null
      then format('Your leave from %s to %s has been approved. %s', v_request.starts_on, v_request.ends_on, p_remarks)
      else format('Your leave from %s to %s has been approved.', v_request.starts_on, v_request.ends_on)
    end,
    jsonb_build_object('leave_request_id', p_request_id));

  if v_cover_assignment_id is not null then
    insert into notifications (staff_id, type, title, body, payload)
    values (p_cover_staff_id, 'cover.assigned', 'You have been assigned to cover a class',
      format('Covering %s from %s to %s.', (select name from classes where id = v_class_id), v_request.starts_on, v_request.ends_on),
      jsonb_build_object('class_id', v_class_id, 'cover_assignment_id', v_cover_assignment_id));
  end if;
end;
$$;
grant execute on function approve_leave(uuid, uuid, boolean, text) to authenticated;

-- === from 20260907150001_announcements.sql, superseded by
-- 20260907220001_rate_limiting.sql's later redefinition (that one wins —
-- see its own comment) ===
-- FR-ANN-02 bug fix. Same signature as create_announcement, so no drop needed there.
create or replace function can_publish_to_audience(
  p_staff_id uuid, p_audience audience_type, p_audience_ids uuid[]
) returns boolean
language plpgsql
stable
as $$
declare
  v_permission text := case p_audience when 'all_staff' then 'announcement.publish_all' else 'announcement.publish_section' end;
begin
  if not has_permission(p_staff_id, v_permission) then
    return false;
  end if;

  if exists (
    select 1 from staff_roles sr
    join role_permissions rp on rp.role_id = sr.role_id
    where sr.staff_id = p_staff_id and sr.revoked_at is null
      and rp.permission_key = v_permission and sr.scope_type in ('school', 'self')
  ) then
    return true;
  end if;

  if p_audience = 'all_staff' then
    return false;
  end if;

  if p_audience = 'section' then
    return p_audience_ids <@ coalesce((
      select array_agg(sr.scope_id)
      from staff_roles sr
      join role_permissions rp on rp.role_id = sr.role_id
      where sr.staff_id = p_staff_id and sr.revoked_at is null
        and rp.permission_key = 'announcement.publish_section' and sr.scope_type = 'grade'
    ), '{}'::uuid[]);
  end if;

  if p_audience = 'class' then
    return not exists (
      select 1 from classes c
      where c.id = any(p_audience_ids)
        and c.grade_id <> all (coalesce((
          select array_agg(sr.scope_id)
          from staff_roles sr
          join role_permissions rp on rp.role_id = sr.role_id
          where sr.staff_id = p_staff_id and sr.revoked_at is null
            and rp.permission_key = 'announcement.publish_section' and sr.scope_type = 'grade'
        ), '{}'::uuid[]))
    );
  end if;

  if p_audience = 'individuals' then
    return not exists (
      select 1 from unnest(p_audience_ids) as target
      where not exists (
        select 1
        from staff_roles caller_sr
        join role_permissions rp on rp.role_id = caller_sr.role_id
        where caller_sr.staff_id = p_staff_id and caller_sr.revoked_at is null
          and rp.permission_key = 'announcement.publish_section' and caller_sr.scope_type = 'grade'
          and (
            exists (
              select 1 from staff_roles target_sr
              join classes c on c.id = target_sr.scope_id
              where target_sr.staff_id = target and target_sr.revoked_at is null
                and target_sr.scope_type = 'class' and c.grade_id = caller_sr.scope_id
            )
            or exists (
              select 1 from staff_roles target_sr
              where target_sr.staff_id = target and target_sr.revoked_at is null
                and target_sr.scope_type = 'grade' and target_sr.scope_id = caller_sr.scope_id
            )
          )
      )
    );
  end if;

  return false;
end;
$$;
grant execute on function can_publish_to_audience(uuid, audience_type, uuid[]) to authenticated;

-- Final version of create_announcement (as redefined in 220001, which runs
-- after 150001 and is what should actually be live): scope-checked via
-- can_publish_to_audience() above, plus the rate-limit check.
create or replace function create_announcement(
  p_title text,
  p_body text,
  p_audience audience_type,
  p_audience_ids uuid[],
  p_priority smallint default 0,
  p_publish_at timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not can_publish_to_audience(current_staff_id(), p_audience, p_audience_ids) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not check_rate_limit('create_announcement', 10, interval '1 hour') then
    raise exception 'rate_limited' using errcode = 'P0005';
  end if;

  insert into announcements (title, body, priority, audience, audience_ids, publish_at, author_id)
  values (p_title, p_body, p_priority, p_audience, p_audience_ids, p_publish_at, current_staff_id())
  returning id into v_id;

  if p_publish_at <= now() then
    perform do_publish_announcement(v_id);
  end if;

  perform write_audit_log('insert', 'announcements', v_id, null,
    jsonb_build_object('audience', p_audience, 'publish_at', p_publish_at));

  return v_id;
end;
$$;
grant execute on function create_announcement(text, text, audience_type, uuid[], smallint, timestamptz) to authenticated;
