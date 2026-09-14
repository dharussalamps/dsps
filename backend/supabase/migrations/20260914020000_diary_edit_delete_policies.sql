-- Diary entries need to be editable/deletable by any diary.manage holder (principal,
-- vice_principal, administrator — see 003_role_permissions.sql), not just the entry's
-- original author. write_diary_entries's `with check (... author_id = current_staff_id())`
-- was written with INSERT in mind, but as a single `for all` policy it also applied to
-- UPDATE — and Postgres re-evaluates WITH CHECK against the new row on every UPDATE, so
-- editing/deleting someone else's entry would fail. Same bug, same fix as write_events in
-- 20260912170000_event_edit_delete.sql: split into per-command policies so the author_id
-- requirement only applies where it was meant to (INSERT), and add an explicit DELETE
-- policy (the old `for all` covered it, but only via the same over-broad USING clause).
drop policy if exists write_diary_entries on diary_entries;

drop policy if exists insert_diary_entries on diary_entries;
create policy insert_diary_entries on diary_entries for insert
  with check (has_permission(current_staff_id(), 'diary.manage') and author_id = current_staff_id());

drop policy if exists update_diary_entries on diary_entries;
create policy update_diary_entries on diary_entries for update
  using (has_permission(current_staff_id(), 'diary.manage'))
  with check (has_permission(current_staff_id(), 'diary.manage'));

drop policy if exists delete_diary_entries on diary_entries;
create policy delete_diary_entries on diary_entries for delete
  using (has_permission(current_staff_id(), 'diary.manage'));
