-- Companion to update_announcement() (20260914030000_announcement_edit_window.sql) — same
-- author-only, 15-minute-from-created_at grace window, but to retract a wrongly-sent
-- announcement entirely instead of fixing it in place. announcement_reads cascades (on
-- delete cascade, see 20260907150001_announcements.sql), so no separate cleanup needed.
-- No client delete policy on announcements (RLS only grants select) — this security definer
-- RPC is the only path to delete one, same pattern as delete_event().
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

  if v_announcement.author_id <> v_staff_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if now() - v_announcement.created_at > interval '15 minutes' then
    raise exception 'edit_window_expired' using errcode = 'P0005';
  end if;

  delete from announcements where id = p_announcement_id;

  perform write_audit_log('delete', 'announcements', p_announcement_id, null, null);
end;
$$;
grant execute on function delete_announcement(uuid) to authenticated;
