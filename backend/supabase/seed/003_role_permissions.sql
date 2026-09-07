-- AdminSpec.md section 5.2 — role -> permission mapping. Safe to re-run.
-- Scope (school/grade/class/self) is not stored here: it is set per staff
-- member on staff_roles when an account is created (build task 21). The
-- "Default scope" column in section 5.2 is guidance for that assignment,
-- not part of this table.

-- principal: every permission
insert into role_permissions (role_id, permission_key)
select (select id from roles where key = 'principal'), key from permissions
on conflict do nothing;

-- vice_principal: every permission except leave.approve and audit.view
insert into role_permissions (role_id, permission_key)
select (select id from roles where key = 'vice_principal'), key
from permissions
where key not in ('leave.approve', 'audit.view')
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
insert into role_permissions (role_id, permission_key)
select (select id from roles where key = 'class_teacher'), perm
from unnest(array[
  'attendance.mark', 'attendance.view_board', 'attendance.early_leave',
  'student.view_full', 'student.view_guardian_contact', 'student.view_benefits',
  'marks.enter',
  'staff.view_directory',
  'leave.request'
]) as perm
on conflict do nothing;

-- administrator
insert into role_permissions (role_id, permission_key)
select (select id from roles where key = 'administrator'), perm
from unnest(array[
  'student.view_full', 'student.edit', 'student.view_benefits', 'student.view_guardian_contact',
  'staff.manage', 'staff.view_full',
  'inventory.manage', 'inventory.view',
  'event.manage', 'diary.manage',
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
