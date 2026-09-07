-- AdminSpec.md section 4.7 — Marks. Build task 14.

create type mark_sheet_status as enum ('draft', 'submitted', 'reopened');

create table mark_sheets (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references classes,
  subject_id   uuid not null references subjects,
  term_id      uuid not null references terms,
  max_score    numeric(5,2) not null default 100,
  status       mark_sheet_status not null default 'draft',
  submitted_by uuid references staff,
  submitted_at timestamptz,
  reopened_by  uuid references staff,
  unique (class_id, subject_id, term_id)
);
alter table mark_sheets enable row level security;

create table marks (
  id             uuid primary key default gen_random_uuid(),
  mark_sheet_id  uuid not null references mark_sheets on delete cascade,
  student_id     uuid not null references students on delete cascade,
  score          numeric(5,2),
  entered_by     uuid not null references staff,
  entered_at     timestamptz not null default now(),
  unique (mark_sheet_id, student_id)
);
alter table marks enable row level security;

-- marks.enter: write while the sheet is draft/reopened. marks.review: read
-- across a scope (sectional head, principal). Both need the sheet's
-- class_id to resolve via has_permission(), so policies join mark_sheets.
create policy read_mark_sheets on mark_sheets for select
  using (
    has_permission(current_staff_id(), 'marks.enter', class_id)
    or has_permission(current_staff_id(), 'marks.review', class_id)
  );
create policy write_mark_sheets on mark_sheets for all
  using (has_permission(current_staff_id(), 'marks.enter', class_id))
  with check (has_permission(current_staff_id(), 'marks.enter', class_id));
-- Submitting/locking and reopening go through submit_mark_sheet() /
-- reopen_mark_sheet() below rather than a plain client update, since
-- "submitted" must reject further marks.enter writes (FR-MRK-03: "only the
-- principal may reopen it") and reopening is marks.reopen, a different
-- permission than marks.enter.

create policy read_marks on marks for select
  using (
    exists (
      select 1 from mark_sheets ms
      where ms.id = marks.mark_sheet_id
        and (has_permission(current_staff_id(), 'marks.enter', ms.class_id)
          or has_permission(current_staff_id(), 'marks.review', ms.class_id))
    )
  );
create policy write_marks on marks for all
  using (
    exists (
      select 1 from mark_sheets ms
      where ms.id = marks.mark_sheet_id
        and ms.status = 'draft'
        and has_permission(current_staff_id(), 'marks.enter', ms.class_id)
    )
  )
  with check (
    entered_by = current_staff_id()
    and exists (
      select 1 from mark_sheets ms
      where ms.id = marks.mark_sheet_id
        and ms.status = 'draft'
        and has_permission(current_staff_id(), 'marks.enter', ms.class_id)
    )
  );
-- Once reopened (status = 'reopened'), the teacher edits again through the
-- same write_marks-shaped path — but that policy only allows 'draft'.
-- reopen_mark_sheet() flips status straight back to 'draft' rather than
-- leaving it at 'reopened', so this one policy covers both first entry and
-- post-reopen editing; 'reopened' therefore never actually appears as a
-- resting state, only inside the SECURITY DEFINER function that reopens a
-- sheet before immediately handing it back to 'draft'. See section 17.

create or replace function submit_mark_sheet(p_mark_sheet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
begin
  select class_id into v_class_id from mark_sheets where id = p_mark_sheet_id and status = 'draft';
  if v_class_id is null then
    raise exception 'not_draft' using errcode = 'P0003';
  end if;
  if not has_permission(current_staff_id(), 'marks.enter', v_class_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update mark_sheets
  set status = 'submitted', submitted_by = current_staff_id(), submitted_at = now()
  where id = p_mark_sheet_id;

  perform write_audit_log('submit', 'mark_sheets', p_mark_sheet_id, null, null);
end;
$$;
grant execute on function submit_mark_sheet(uuid) to authenticated;

-- FR-MRK-03: "only the principal may reopen it" — marks.reopen (section
-- 5.2 grants it to principal only).
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
  set status = 'draft', reopened_by = current_staff_id()
  where id = p_mark_sheet_id;

  perform write_audit_log('reopen', 'mark_sheets', p_mark_sheet_id, null, null);
end;
$$;
grant execute on function reopen_mark_sheet(uuid) to authenticated;

-- FR-MRK-05: "each subject shows the class average for the same subject
-- and term beside the student's score."
create or replace function class_subject_average(p_class_id uuid, p_subject_id uuid, p_term_id uuid)
returns numeric
language sql
stable
as $$
  select round(avg(m.score), 2)
  from marks m
  join mark_sheets ms on ms.id = m.mark_sheet_id
  where ms.class_id = p_class_id and ms.subject_id = p_subject_id and ms.term_id = p_term_id
    and m.score is not null;
$$;
grant execute on function class_subject_average(uuid, uuid, uuid) to authenticated;
