-- AdminSpec.md section 4/5 — RLS policies for every table created so far
-- (build task 4, first slice; later phases add policies for their own new
-- tables alongside those tables, not here).
--
-- Conventions used throughout:
--  * has_permission(current_staff_id(), '<key>', <class_id or null>) is the
--    only access-control primitive (section 5.3) — never re-derive scope
--    logic inline in a policy.
--  * Tables with no natural class/grade scoping (roles, permissions,
--    subjects, grades, ...) are readable by any signed-in staff member and
--    have no client write policy at all: they're reference/curriculum data
--    changed by a migration + seed row (section 5.1) or by the spreadsheet
--    import (build task 5), both of which run with the service role and so
--    bypass RLS entirely — "unreadable [to writes] is the correct default"
--    (section 2, Rules of construction).
--  * A row-owner check (`staff_id = current_staff_id()`) is used wherever
--    the record is inherently about the acting user themselves — this is
--    how 'self'-scoped permissions (section 5.3's implementation note) get
--    their real "only your own records" restriction.

-- ---------------------------------------------------------------------
-- Reference / curriculum data: read for any signed-in staff member.
-- ---------------------------------------------------------------------
create policy read_grades on grades for select using (current_staff_id() is not null);
create policy read_subjects on subjects for select using (current_staff_id() is not null);
create policy read_grade_subjects on grade_subjects for select using (current_staff_id() is not null);
create policy read_roles on roles for select using (current_staff_id() is not null);
create policy read_permissions on permissions for select using (current_staff_id() is not null);
create policy read_role_permissions on role_permissions for select using (current_staff_id() is not null);
create policy read_leave_types on leave_types for select using (current_staff_id() is not null);
create policy read_classes on classes for select using (current_staff_id() is not null);
create policy read_class_subject_teachers on class_subject_teachers for select using (current_staff_id() is not null);

create policy write_class_subject_teachers on class_subject_teachers for all
  using (has_permission(current_staff_id(), 'staff.manage'))
  with check (has_permission(current_staff_id(), 'staff.manage'));

-- ---------------------------------------------------------------------
-- Calendar and settings: read for any signed-in staff; write needs
-- calendar.manage (section 15 open decision #4: principal only, not
-- granted to administrator).
-- ---------------------------------------------------------------------
create policy read_academic_years on academic_years for select using (current_staff_id() is not null);
create policy write_academic_years on academic_years for all
  using (has_permission(current_staff_id(), 'calendar.manage'))
  with check (has_permission(current_staff_id(), 'calendar.manage'));

create policy read_terms on terms for select using (current_staff_id() is not null);
create policy write_terms on terms for all
  using (has_permission(current_staff_id(), 'calendar.manage'))
  with check (has_permission(current_staff_id(), 'calendar.manage'));

create policy read_calendar_days on calendar_days for select using (current_staff_id() is not null);
create policy write_calendar_days on calendar_days for all
  using (has_permission(current_staff_id(), 'calendar.manage'))
  with check (has_permission(current_staff_id(), 'calendar.manage') and created_by = current_staff_id());

create policy read_school_settings on school_settings for select using (current_staff_id() is not null);
create policy write_school_settings on school_settings for update
  using (has_permission(current_staff_id(), 'calendar.manage'))
  with check (has_permission(current_staff_id(), 'calendar.manage'));

-- ---------------------------------------------------------------------
-- Roles, scope and cover.
-- ---------------------------------------------------------------------
create policy read_staff_roles on staff_roles for select
  using (staff_id = current_staff_id() or has_permission(current_staff_id(), 'account.manage'));
create policy write_staff_roles on staff_roles for all
  using (has_permission(current_staff_id(), 'account.manage'))
  with check (has_permission(current_staff_id(), 'account.manage'));

create policy read_cover_assignments on cover_assignments for select
  using (
    staff_id = current_staff_id()
    or has_permission(current_staff_id(), 'cover.assign', class_id)
    or has_permission(current_staff_id(), 'attendance.view_board', class_id)
    or has_permission(current_staff_id(), 'attendance.mark', class_id)
  );
create policy write_cover_assignments on cover_assignments for all
  using (has_permission(current_staff_id(), 'cover.assign', class_id))
  with check (has_permission(current_staff_id(), 'cover.assign', class_id) and assigned_by = current_staff_id());

-- ---------------------------------------------------------------------
-- Staff. Every staff member can always see their own row; beyond that,
-- staff.view_directory / staff.view_full grant the rest (section 10:
-- StaffDirectory needs view_directory, deeper staff data needs view_full —
-- that split governs staff_attendance/responsibilities/leave, built with
-- those features; the staff table itself carries no such split, matching
-- how student.view_basic vs student.view_full both read the same table).
-- ---------------------------------------------------------------------
create policy read_staff on staff for select
  using (
    id = current_staff_id()
    or has_permission(current_staff_id(), 'staff.view_directory')
    or has_permission(current_staff_id(), 'staff.view_full')
  );
create policy write_staff on staff for all
  using (has_permission(current_staff_id(), 'staff.manage'))
  with check (has_permission(current_staff_id(), 'staff.manage'));

-- ---------------------------------------------------------------------
-- Students and enrolments, scoped through the current-year enrolment
-- (student_current_class_id / the enrolment's own class_id).
-- ---------------------------------------------------------------------
create policy read_students on students for select
  using (
    has_permission(current_staff_id(), 'student.view_basic', student_current_class_id(id))
    or has_permission(current_staff_id(), 'student.view_full', student_current_class_id(id))
  );
create policy write_students on students for all
  using (has_permission(current_staff_id(), 'student.edit', student_current_class_id(id)))
  with check (has_permission(current_staff_id(), 'student.edit', student_current_class_id(id)));

create policy read_student_enrolments on student_enrolments for select
  using (
    has_permission(current_staff_id(), 'student.view_basic', class_id)
    or has_permission(current_staff_id(), 'student.view_full', class_id)
  );
-- Enrolments change via promotion/import (build task 5), which runs with
-- the service role — no client write policy.

-- ---------------------------------------------------------------------
-- Guardians. Column-level restriction from section 5.4: seeing that a
-- guardian link exists at all (name, relationship) needs
-- student.view_guardian_contact scoped to the student's class, same as
-- the phone numbers — there's no lesser tier, matching "plain student
-- queries never join guardians.phone_*" (the guardians table is simply
-- never joined unless that permission is held). student.edit is school-
-- scope-only in the current seed (only 'administrator' holds it), so
-- write access is checked at school scope rather than per-student.
-- ---------------------------------------------------------------------
create policy read_guardians on guardians for select
  using (
    has_permission(current_staff_id(), 'student.edit')
    or exists (
      select 1 from student_guardians sg
      where sg.guardian_id = guardians.id
        and has_permission(current_staff_id(), 'student.view_guardian_contact', student_current_class_id(sg.student_id))
    )
  );
create policy write_guardians on guardians for all
  using (has_permission(current_staff_id(), 'student.edit'))
  with check (has_permission(current_staff_id(), 'student.edit'));

create policy read_student_guardians on student_guardians for select
  using (
    has_permission(current_staff_id(), 'student.edit')
    or has_permission(current_staff_id(), 'student.view_guardian_contact', student_current_class_id(student_id))
  );
create policy write_student_guardians on student_guardians for all
  using (has_permission(current_staff_id(), 'student.edit'))
  with check (has_permission(current_staff_id(), 'student.edit'));

-- section 5.4: a dedicated, explicitly-named view for the one place the
-- client should ever read guardian phone numbers from. security_invoker is
-- required (Postgres < 15 default: a view runs underlying-table RLS as the
-- view's *owner*, which would silently bypass every policy above) so this
-- view enforces RLS as the calling user, exactly like querying the tables
-- directly — it exists for a convenient joined shape, not looser access.
create view student_guardians_contact
  with (security_invoker = true) as
  select
    sg.student_id,
    g.id as guardian_id,
    g.full_name,
    g.relationship,
    g.phone_primary,
    g.phone_alt,
    sg.is_primary
  from student_guardians sg
  join guardians g on g.id = sg.guardian_id;

-- ---------------------------------------------------------------------
-- Audit log: read-only to the client. Every write path that must produce
-- an audit_log row (section 14, Definition of done) does so from an Edge
-- Function or a SECURITY DEFINER trigger running with elevated rights —
-- never from a direct client insert, which would let anyone forge history.
-- ---------------------------------------------------------------------
create policy read_audit_log on audit_log for select
  using (has_permission(current_staff_id(), 'audit.view'));
