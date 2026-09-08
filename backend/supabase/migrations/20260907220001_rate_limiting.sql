-- AdminSpec.md build task 23: rate limiting. Supabase's platform-level
-- Auth rate limits (OTP/sign-in attempts) are dashboard configuration, not
-- something a migration can set — see backend/README.md. What a migration
-- *can* do is guard the SECURITY DEFINER functions this build added that
-- can page other people or do real work on every call: a class teacher
-- mashing "Remind" pushes a notification each time (remind_unmarked_class
-- already checks "not already submitted", but that's not the same as rate
-- limiting the button itself), and announcement/import calls can be
-- resource-intensive. Everything else (submit_attendance,
-- approve_leave, ...) is naturally self-limiting — you can't usefully
-- call them more than once for the same real-world event, so a rate limit
-- there would only get in the way.

create table rate_limit_hits (
  actor_id    uuid not null,
  action      text not null,
  occurred_at timestamptz not null default now()
);
-- No RLS needed: never queried directly by the client, only through
-- check_rate_limit() below, and nothing here is sensitive (who did what
-- how often is exactly what audit_log already exposes to audit.view).
alter table rate_limit_hits enable row level security;
create index rate_limit_hits_actor_action on rate_limit_hits (actor_id, action, occurred_at);

create or replace function check_rate_limit(p_action text, p_max_count int, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := current_staff_id();
  v_count int;
begin
  if v_actor is null then
    return false;
  end if;

  select count(*) into v_count
  from rate_limit_hits
  where actor_id = v_actor and action = p_action and occurred_at > now() - p_window;

  if v_count >= p_max_count then
    return false;
  end if;

  insert into rate_limit_hits (actor_id, action) values (v_actor, p_action);
  return true;
end;
$$;
grant execute on function check_rate_limit(text, int, interval) to authenticated;

create or replace function remind_unmarked_class(p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_name text;
  v_recipient uuid;
  v_already_submitted boolean;
begin
  if not has_permission(current_staff_id(), 'attendance.remind', p_class_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not check_rate_limit('remind_unmarked_class:' || p_class_id::text, 1, interval '2 minutes') then
    raise exception 'rate_limited' using errcode = 'P0005';
  end if;

  select exists (
    select 1 from attendance_submissions
    where class_id = p_class_id and on_date = current_date
  ) into v_already_submitted;
  if v_already_submitted then
    raise exception 'already_submitted' using errcode = 'P0002';
  end if;

  select name into v_class_name from classes where id = p_class_id;

  select coalesce(
    (select ca.staff_id from cover_assignments ca
     where ca.class_id = p_class_id and current_date between ca.starts_on and ca.ends_on
     order by ca.created_at desc limit 1),
    (select class_teacher_id from classes where id = p_class_id)
  ) into v_recipient;

  if v_recipient is not null then
    insert into notifications (staff_id, type, title, body, payload)
    values (
      v_recipient,
      'attendance.remind_unmarked',
      'Attendance not marked',
      format('%s has not marked attendance yet today.', v_class_name),
      jsonb_build_object('class_id', p_class_id, 'on_date', current_date, 'manual', true)
    );
  end if;
end;
$$;
grant execute on function remind_unmarked_class(uuid) to authenticated;

-- Re-declared here (rather than only in 20260907150001_announcements.sql)
-- because this migration's whole job is "the same function, plus a rate
-- limit check" — CREATE OR REPLACE means whichever migration runs last
-- wins, and this one runs after 150001's fix to the audience-scope check
-- (see that file: can_publish_to_audience() replaced a bare
-- has_permission() call that couldn't work for a grade-scoped
-- sectional_head and didn't validate audience_ids against the caller's own
-- scope at all). This copy must stay in sync with that one.
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
