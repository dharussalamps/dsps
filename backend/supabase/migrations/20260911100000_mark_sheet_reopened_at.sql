-- AdminSpec.md section 4.7 — Marks. reopened_by already recorded *who*
-- reopened a mark sheet; this adds *when*, mirroring submitted_at next to
-- submitted_by, so the exam marks screen can show a reopened timestamp
-- instead of just silently flipping the status back to draft.
alter table mark_sheets add column if not exists reopened_at timestamptz;

create or replace function reopen_mark_sheet(p_mark_sheet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
begin
  select class_id into v_class_id from mark_sheets where id = p_mark_sheet_id and status = 'submitted';
  if v_class_id is null then
    raise exception 'not_submitted' using errcode = 'P0003';
  end if;
  if not has_permission(current_staff_id(), 'marks.reopen', v_class_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update mark_sheets
  set status = 'draft', reopened_by = current_staff_id(), reopened_at = now()
  where id = p_mark_sheet_id;

  perform write_audit_log('reopen', 'mark_sheets', p_mark_sheet_id, null, null);
end;
$$;
grant execute on function reopen_mark_sheet(uuid) to authenticated;
