-- FR-ADM-03: "grades, classes, subjects and terms are maintained by an
-- administrator." Terms/academic_years already had a write policy
-- (calendar.manage — see 20260907100002_rls_policies_phase1.sql); grades,
-- subjects, grade_subjects and classes did not — that migration's own
-- comment calls them "reference/curriculum data ... changed by a migration
-- + seed row ... or by the spreadsheet import," which was true only until
-- now: there was no admin screen for any of the four, and no write policy
-- to let one exist. Gated on staff.manage, the same permission
-- write_class_subject_teachers already uses immediately above these tables
-- in that migration — administrator and principal both hold it, matching
-- FR-ADM-03's "an administrator" without inventing a new permission key
-- outside section 5.1's closed list.
create policy write_grades on grades for all
  using (has_permission(current_staff_id(), 'staff.manage'))
  with check (has_permission(current_staff_id(), 'staff.manage'));

create policy write_subjects on subjects for all
  using (has_permission(current_staff_id(), 'staff.manage'))
  with check (has_permission(current_staff_id(), 'staff.manage'));

create policy write_grade_subjects on grade_subjects for all
  using (has_permission(current_staff_id(), 'staff.manage'))
  with check (has_permission(current_staff_id(), 'staff.manage'));

create policy write_classes on classes for all
  using (has_permission(current_staff_id(), 'staff.manage'))
  with check (has_permission(current_staff_id(), 'staff.manage'));
