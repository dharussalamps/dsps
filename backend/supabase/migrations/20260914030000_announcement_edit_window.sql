-- Announcements are otherwise immutable after create_announcement() (build task 16) — the
-- author gets a short grace window to fix a typo/mistake right after posting, not open-ended
-- editing (which would mean an already-notified audience sees changed content long after they
-- read it). Author-only, 15 minutes from created_at, and only title/body/priority — audience
-- and schedule aren't editable since do_publish_announcement() may have already dispatched to
-- the original audience by the time this runs.
create or replace function update_announcement(
  p_announcement_id uuid,
  p_title text,
  p_body text,
  p_priority smallint default 0
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_announcement announcements%rowtype;
  v_staff_id uuid := current_staff_id();
begin
  if v_staff_id is null then
    raise exception 'no_staff_record' using errcode = 'P0001';
  end if;

  select * into v_announcement from announcements where id = p_announcement_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_announcement.author_id <> v_staff_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if now() - v_announcement.created_at > interval '15 minutes' then
    raise exception 'edit_window_expired' using errcode = 'P0005';
  end if;

  update announcements
  set title = p_title, body = p_body, priority = p_priority
  where id = p_announcement_id;

  perform write_audit_log('update', 'announcements', p_announcement_id,
    jsonb_build_object('title', v_announcement.title, 'body', v_announcement.body, 'priority', v_announcement.priority),
    jsonb_build_object('title', p_title, 'body', p_body, 'priority', p_priority));
end;
$$;
grant execute on function update_announcement(uuid, text, text, smallint) to authenticated;
