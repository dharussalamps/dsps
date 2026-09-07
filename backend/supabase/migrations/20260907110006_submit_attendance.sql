-- write_audit_log(): every RLS policy leaves audit_log with no client
-- INSERT policy on purpose (backend/supabase/migrations/
-- ..._rls_policies_phase1.sql — "never from a direct client insert, which
-- would let anyone forge history"). SECURITY DEFINER is the standard
-- Postgres way to let an ordinary authenticated call still produce an
-- audit row without granting blanket table access; search_path is pinned
-- to prevent the well-known SECURITY DEFINER search_path hijack.
create or replace function write_audit_log(
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_before jsonb default null,
  p_after jsonb default null,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (actor_id, action, entity, entity_id, before, after, reason)
  values (current_staff_id(), p_action, p_entity, p_entity_id, p_before, p_after, p_reason);
end;
$$;
grant execute on function write_audit_log(text, text, uuid, jsonb, jsonb, text) to authenticated;

-- AdminSpec.md section 8 — POST /submit-attendance's transactional core.
-- SECURITY INVOKER (the default): every insert below still goes through
-- the calling teacher's own RLS policies (write_attendance_submissions,
-- write_student_attendance) — this function does not bypass permission
-- checks, it just makes the multi-table write atomic (a plpgsql function
-- body is one transaction) and idempotent.
--
-- Idempotency (section 9, rule 1) and the 409-conflict rule (rule 6) are
-- deliberately kept separate from *editing* an already-submitted class:
-- this function only ever creates a submission. A resubmission carrying
-- the same client_submission_id replays the original result; a
-- resubmission for the same (class_id, on_date) carrying a *different*
-- client_submission_id — e.g. a second teacher's device, or the same
-- teacher's own device racing an earlier offline-queued attempt — is
-- always rejected as a conflict, never silently merged. Editing a
-- submission that already exists is a separate, always-online action:
-- a plain client update against student_attendance, enforced by the
-- amend_student_attendance RLS policy (edit-window / amend_locked+reason),
-- with no need to go through this function or the offline queue.
create or replace function submit_attendance(
  p_class_id uuid,
  p_on_date date,
  p_entries jsonb, -- [{ "student_id": uuid, "status": "present"|"absent"|"late", "reason": text|null }, ...]
  p_device_id text,
  p_client_submission_id uuid
) returns uuid
language plpgsql
as $$
declare
  v_staff_id uuid := current_staff_id();
  v_existing_id uuid;
  v_conflict_id uuid;
  v_submission_id uuid;
  v_entry jsonb;
begin
  if v_staff_id is null then
    raise exception 'no_staff_record' using errcode = 'P0001';
  end if;

  select id into v_existing_id from attendance_submissions where client_submission_id = p_client_submission_id;
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  select id into v_conflict_id from attendance_submissions where class_id = p_class_id and on_date = p_on_date;
  if v_conflict_id is not null then
    raise exception 'already_submitted' using errcode = 'P0002', detail = v_conflict_id::text;
  end if;

  insert into attendance_submissions (class_id, on_date, submitted_by, device_id, client_submission_id)
  values (p_class_id, p_on_date, v_staff_id, p_device_id, p_client_submission_id)
  returning id into v_submission_id;

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    insert into student_attendance (student_id, class_id, on_date, status, reason, marked_by)
    values (
      (v_entry ->> 'student_id')::uuid,
      p_class_id,
      p_on_date,
      (v_entry ->> 'status')::attendance_status,
      v_entry ->> 'reason',
      v_staff_id
    );
  end loop;

  perform write_audit_log('insert', 'attendance_submissions', v_submission_id, null,
    jsonb_build_object('class_id', p_class_id, 'on_date', p_on_date, 'entry_count', jsonb_array_length(p_entries)));

  return v_submission_id;
end;
$$;

grant execute on function submit_attendance(uuid, date, jsonb, text, uuid) to authenticated;
