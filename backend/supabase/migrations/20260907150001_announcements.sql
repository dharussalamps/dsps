-- AdminSpec.md section 4.9 (announcements, announcement_reads) and section
-- 7/8 (publish, scheduled publish). Build task 16.

create type audience_type as enum ('all_staff', 'section', 'class', 'individuals');

create table announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text not null,
  priority      smallint not null default 0,
  audience      audience_type not null,
  audience_ids  uuid[],
  attachment_path text,
  publish_at    timestamptz not null default now(),
  author_id     uuid not null references staff,
  created_at    timestamptz not null default now()
);
alter table announcements enable row level security;

create table announcement_reads (
  announcement_id uuid references announcements on delete cascade,
  staff_id        uuid references staff on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (announcement_id, staff_id)
);
alter table announcement_reads enable row level security;

-- Resolves "does this staff member receive this announcement" — used by
-- both RLS (as current_staff_id()) and do_publish_announcement() (to
-- build the recipient list, as an arbitrary target id).
create or replace function staff_matches_audience(p_staff_id uuid, p_audience audience_type, p_audience_ids uuid[])
returns boolean
language sql
stable
as $$
  select case p_audience
    when 'all_staff' then exists (select 1 from staff where id = p_staff_id and status = 'active')
    when 'individuals' then p_staff_id = any(p_audience_ids)
    when 'section' then exists (
      -- section = grade ids. "Everyone in the section" = anyone with a
      -- grade-scoped role for it (sectional heads and similar), plus the
      -- class teachers of its classes.
      select 1 from staff_roles sr
      where sr.staff_id = p_staff_id and sr.scope_type = 'grade' and sr.scope_id = any(p_audience_ids) and sr.revoked_at is null
      union
      select 1 from classes c where c.class_teacher_id = p_staff_id and c.grade_id = any(p_audience_ids)
    )
    when 'class' then exists (
      select 1 from classes c where c.class_teacher_id = p_staff_id and c.id = any(p_audience_ids)
      union
      select 1 from staff_roles sr
      where sr.staff_id = p_staff_id and sr.scope_type = 'class' and sr.scope_id = any(p_audience_ids) and sr.revoked_at is null
      union
      select 1 from cover_assignments ca
      where ca.staff_id = p_staff_id and ca.class_id = any(p_audience_ids)
        and current_date between ca.starts_on and ca.ends_on
    )
    else false
  end;
$$;
grant execute on function staff_matches_audience(uuid, audience_type, uuid[]) to authenticated;

-- FR-ANN-02 bug fix: create_announcement previously only checked
-- has_permission(caller, 'publish_all'|'publish_section') with no class_id,
-- which (a) could never succeed for a grade-scoped sectional_head, since
-- has_permission()'s 'grade' branch needs a class to resolve a grade from,
-- and (b) never validated that the *targeted* audience_ids actually fall
-- inside whatever scope the caller does hold — so the one role case that
-- did pass (a school-scoped grant) could target any section/class/
-- individual with no restriction at all. This resolves both: a
-- grade-scoped 'announcement.publish_section' grant may target only
-- sections/classes/individuals inside that same grade; a school-scoped
-- grant (principal, vice_principal, and now administrator for
-- 'publish_all' specifically — see seed 003_role_permissions.sql) may
-- target anything the base permission already allows.
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
    return true; -- school-scoped grant: the base permission check is enough
  end if;

  if p_audience = 'all_staff' then
    return false; -- only a school-scoped publish_all grant may address everyone
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

-- Visible once published (or always to its own author, so a scheduled
-- draft doesn't just disappear from its composer's view) and only to
-- staff the audience resolves to.
create policy read_announcements on announcements for select
  using (
    (publish_at <= now() or author_id = current_staff_id())
    and staff_matches_audience(current_staff_id(), audience, audience_ids)
  );

create policy read_own_announcement_reads on announcement_reads for select
  using (staff_id = current_staff_id());
create policy mark_own_read on announcement_reads for update
  using (staff_id = current_staff_id())
  with check (staff_id = current_staff_id());
-- No client insert policy on announcement_reads: the "reads-pending" rows
-- (section 8: "writes reads-pending rows") are created by
-- do_publish_announcement() for the whole resolved audience at once, not
-- one at a time by each reader.

-- Dispatches one announcement: resolves its audience, writes a pending
-- (read_at defaults to inserted-now, see note below) announcement_reads
-- row per recipient, and a notifications row per recipient. Whether an
-- announcement has already been dispatched is tracked by whether any
-- announcement_reads rows exist for it — see docs/AdminSpec.md section 17
-- for why there's no separate "sent" column.
create or replace function do_publish_announcement(p_announcement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_announcement record;
  v_recipient uuid;
begin
  select * into v_announcement from announcements where id = p_announcement_id;
  if v_announcement is null then return; end if;

  for v_recipient in
    select id from staff
    where status = 'active' and staff_matches_audience(id, v_announcement.audience, v_announcement.audience_ids)
  loop
    insert into announcement_reads (announcement_id, staff_id, read_at)
    values (p_announcement_id, v_recipient, null)
    on conflict (announcement_id, staff_id) do nothing;

    insert into notifications (staff_id, type, title, body, payload, sent_at)
    values (v_recipient, 'announcement.published', v_announcement.title, v_announcement.body,
            jsonb_build_object('announcement_id', p_announcement_id), now());
  end loop;
end;
$$;

-- announcement_reads.read_at is "not null default now()" per section 4.9 —
-- a genuine conflict with "reads-pending rows", which are by definition
-- unread. Relaxed to nullable here so a pending row can mean "not read
-- yet"; a reader's own update to mark it read sets read_at = now().
alter table announcement_reads alter column read_at drop not null;
alter table announcement_reads alter column read_at drop default;

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

-- section 7: publish_scheduled_announcements, every 5 minutes. "Already
-- dispatched" = has at least one announcement_reads row. Section 7's intro
-- says every job checks is_school_day() first, applied literally here too
-- even though it reads oddly for announcements specifically (section 1's
-- stated reason for the rule — "a holiday must not produce 900 absence
-- records" — doesn't really apply to a newsletter). declare-closure
-- (section 8) sends its own notification outside this job, so a same-day
-- closure announcement isn't blocked by this.
create or replace function job_publish_scheduled_announcements() returns void
language sql as $$
  select do_publish_announcement(a.id)
  from announcements a
  where is_school_day(current_date)
    and a.publish_at <= now()
    and not exists (select 1 from announcement_reads ar where ar.announcement_id = a.id);
$$;
select cron.schedule('publish_scheduled_announcements', '*/5 * * * *', 'select job_publish_scheduled_announcements()');
