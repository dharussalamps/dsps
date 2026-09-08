-- AdminSpec.md section 5.2 — role -> permission mapping. Safe to re-run.
-- Scope (school/grade/class/self) is not stored here: it is set per staff
-- member on staff_roles when an account is created (build task 21). The
-- "Default scope" column in section 5.2 is guidance for that assignment,
-- not part of this table.

-- principal: every permission
insert into role_permissions (role_id, permission_key)
select (select id from roles where key = 'principal'), key from permissions
on conflict do nothing;

-- vice_principal: every permission except leave.approve and audit.view.
-- FR-ACH-05 additionally excludes 'student.view_benefits': the SRS names
-- benefit-record visibility explicitly and exhaustively ("visible only to
-- the principal, an administrator, and the student's own class teacher" —
-- benefits disclose a family's financial circumstances) and does not
-- include the vice-principal, unlike every other "as principal" grant in
-- section 4.1's role table. A blanket "everything but two keys" mapping
-- would otherwise leak it.
insert into role_permissions (role_id, permission_key)
select (select id from roles where key = 'vice_principal'), key
from permissions
where key not in ('leave.approve', 'audit.view', 'student.view_benefits')
on conflict do nothing;

-- sectional_head
insert into role_permissions (role_id, permission_key)
select (select id from roles where key = 'sectional_head'), perm
from unnest(array[
  'attendance.mark', 'attendance.view_board', 'attendance.remind', 'attendance.early_leave',
  'student.view_full', 'student.view_guardian_contact',
  'marks.review',
  'staff.view_directory', 'staff.view_full', 'staff.assign_responsibility',
  'leave.view_balances', 'leave.request',
  'cover.assign',
  'announcement.publish_section',
  'analytics.view'
]) as perm
on conflict do nothing;

-- class_teacher
-- SRS section 4.2's permission matrix gives the class teacher "Own" under
-- "View analytics" (attendance/at-risk figures for their own class), same
-- as "Own" for mark attendance / view student — analytics.view was missing
-- here even though every other "Own"-column capability was granted.
insert into role_permissions (role_id, permission_key)
select (select id from roles where key = 'class_teacher'), perm
from unnest(array[
  'attendance.mark', 'attendance.view_board', 'attendance.early_leave',
  'student.view_full', 'student.view_guardian_contact', 'student.view_benefits',
  'marks.enter',
  'staff.view_directory',
  'leave.request',
  'analytics.view'
]) as perm
on conflict do nothing;

-- administrator
-- SRS section 4.2's permission matrix gives the administrator "Staff" under
-- "Publish announcement" (as opposed to the principal's "Any") — screen #28
-- (Compose announcement) is explicitly available to them too. Granting
-- 'announcement.publish_all' (not 'publish_section') matches that: per
-- create_announcement()'s v_permission mapping, publish_all is only ever
-- checked when the audience is 'all_staff', so this grants exactly
-- "publish to all staff," nothing narrower or broader.
insert into role_permissions (role_id, permission_key)
select (select id from roles where key = 'administrator'), perm
from unnest(array[
  'student.view_full', 'student.edit', 'student.view_benefits', 'student.view_guardian_contact',
  'staff.manage', 'staff.view_full',
  'inventory.manage', 'inventory.view',
  'event.manage', 'diary.manage',
  'announcement.publish_all',
  'account.manage',
  'attendance.amend_locked',
  'leave.request'
]) as perm
on conflict do nothing;

-- staff
insert into role_permissions (role_id, permission_key)
select (select id from roles where key = 'staff'), perm
from unnest(array['staff.view_directory', 'leave.request']) as perm
on conflict do nothing;
