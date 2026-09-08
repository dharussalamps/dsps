-- Follow-up hardening pass after a full SRS re-audit (see docs/AdminSpec.md
-- section 17, "Phase 17"). FR-ADM-04 ("every creation, modification and
-- deletion of a record is written to an audit log") previously only held
-- for the handful of tables written through a SECURITY DEFINER RPC
-- (attendance, leave, marks, announcements, cover, import) — every direct
-- client write via PostgREST (staff accounts, role grants, calendar
-- overrides, school settings, achievements/memberships/benefits,
-- inventory, events/diary, responsibilities, academic structure) produced
-- no audit trail at all. A generic AFTER trigger closes that gap for every
-- table with a single `id uuid` primary key, without touching each
-- screen's own API code.

create or replace function audit_row_change()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    perform write_audit_log('delete', TG_TABLE_NAME, OLD.id, to_jsonb(OLD), null);
    return OLD;
  elsif TG_OP = 'UPDATE' then
    perform write_audit_log('update', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  else
    perform write_audit_log('insert', TG_TABLE_NAME, NEW.id, null, to_jsonb(NEW));
    return NEW;
  end if;
end;
$$;

-- Attached only to tables with a plain `id uuid` primary key — pure
-- many-to-many join tables (student_guardians, grade_subjects,
-- announcement_reads) are relationship rows, not records of consequence in
-- the SRS sense, and have no single-column id to log against; school_settings
-- is a singleton with a boolean key and gets its own trigger below instead.
-- attendance/marks/leave/cover/announcements/students are intentionally
-- excluded — each already calls write_audit_log explicitly from its own
-- RPC (see 20260907110006_submit_attendance.sql, 20260907120003_
-- leave_decisions.sql, 20260907130001_marks.sql, 20260907120005_
-- assign_cover.sql, 20260907150001_announcements.sql, and this file's own
-- set_student_status()/import_students() for students) and a second,
-- generic trigger on top would double-log every one of those writes.
do $$
declare
  t text;
begin
  foreach t in array array[
    'staff', 'staff_roles', 'calendar_days',
    'achievements', 'memberships', 'benefits',
    'inventory_items', 'inventory_transactions',
    'events', 'diary_entries', 'responsibilities',
    'grades', 'classes', 'subjects', 'class_subject_teachers',
    'academic_years', 'terms', 'guardians',
    'student_enrolments'
  ]
  loop
    execute format(
      'create trigger audit_%1$s after insert or update or delete on %1$s for each row execute function audit_row_change()',
      t
    );
  end loop;
end;
$$;

-- school_settings: a single boolean-keyed row, so audit_row_change()'s
-- NEW.id/OLD.id (typed uuid) can't be used directly. Logged with a null
-- entity_id instead — there is only ever one row, so the entity name alone
-- identifies it.
create or replace function audit_school_settings_change()
returns trigger
language plpgsql
as $$
begin
  perform write_audit_log('update', 'school_settings', null, to_jsonb(OLD), to_jsonb(NEW));
  return NEW;
end;
$$;
create trigger audit_school_settings
  after update on school_settings
  for each row execute function audit_school_settings_change();

-- FR-ATT-06: "every amendment is recorded in the audit log with a reason."
-- amend_student_attendance (RLS, see 20260907110001_attendance.sql) already
-- enforces that a post-window write carries attendance.amend_locked and a
-- non-null reason; nothing previously turned that write into an audit_log
-- row. Deliberately UPDATE-only (not INSERT): the ~1,050 initial marks a
-- school produces every school day are already fully accounted for via
-- student_attendance.marked_by/marked_at without a second, near-duplicate
-- log entry per student — it's the *changes* to an already-submitted
-- record (within-window correction or post-window amendment) that the SRS
-- is calling a record of consequence here.
create or replace function audit_student_attendance_update()
returns trigger
language plpgsql
as $$
begin
  perform write_audit_log('update', 'student_attendance', NEW.id, to_jsonb(OLD), to_jsonb(NEW), NEW.reason);
  return NEW;
end;
$$;
create trigger audit_student_attendance
  after update on student_attendance
  for each row execute function audit_student_attendance_update();

-- NFR-PRF-02: every roster/marks/early-leave/attendance query filters
-- student_enrolments by class_id (and separately by student_id, already
-- covered by the table's unique(student_id, academic_year_id) index) — it
-- had no index of its own, so every one of those reads was a sequential
-- scan.
create index if not exists student_enrolments_class_id on student_enrolments (class_id);

-- FR-STU-12: "a student may be marked as left, retaining all records but
-- excluded from rosters and counts." The students table already carries
-- exactly the status column this needs (person_status: active/inactive/
-- left — see 20260907090003_people.sql); there was no client-reachable way
-- to change it. Routed through an audited RPC rather than a bare RLS
-- update because a status change here is exactly the kind of action the
-- SRS's own "destructive and irreversible actions require confirmation"
-- (NFR-USE-05) has in mind, and student.edit is the same permission that
-- already gates the rest of a student's editable fields.
create or replace function set_student_status(p_student_id uuid, p_status person_status, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before person_status;
begin
  if not has_permission(current_staff_id(), 'student.edit') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select status into v_before from students where id = p_student_id;
  if v_before is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  update students set status = p_status, updated_at = now() where id = p_student_id;

  perform write_audit_log('update', 'students', p_student_id,
    jsonb_build_object('status', v_before), jsonb_build_object('status', p_status), p_reason);
end;
$$;
grant execute on function set_student_status(uuid, person_status, text) to authenticated;
