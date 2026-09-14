-- Two changes to delete_announcement() (20260914040000_delete_announcement.sql):
--
-- 1. Widened an ordinary author's window from 15 minutes to "any time on the day it was
--    posted" — deleting a wrongly-sent announcement is a more urgent, corrective action than
--    fixing a typo in place (update_announcement, still 15 minutes), and 15 minutes made it
--    impossible to retract a mistake noticed even a few minutes later. Still bounded: not
--    erasable indefinitely once its audience may have read and acted on it.
-- 2. Whoever holds 'announcement.publish_all' (principal, vice_principal, administrator —
--    same school-wide grant that lets them target "whole school" in the first place, see
--    can_publish_to_audience()) can delete ANY announcement, by anyone, at any time — not
--    just their own within a window. Leadership needs to be able to retract someone else's
--    mistake, not just their own.
create or replace function delete_announcement(p_announcement_id uuid) returns void
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

  if not has_permission(v_staff_id, 'announcement.publish_all') then
    if v_announcement.author_id <> v_staff_id then
      raise exception 'forbidden' using errcode = '42501';
    end if;

    if v_announcement.created_at::date <> current_date then
      raise exception 'delete_window_expired' using errcode = 'P0005';
    end if;
  end if;

  delete from announcements where id = p_announcement_id;

  perform write_audit_log('delete', 'announcements', p_announcement_id, null, null);
end;
$$;
