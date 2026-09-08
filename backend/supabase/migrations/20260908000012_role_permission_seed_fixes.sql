-- `backend/supabase/seed/003_role_permissions.sql` was fixed in this same
-- pass (FR-ACH-05 vice_principal leak; FR-ADM-03/FR-ANL-02 missing grants),
-- but seed files only run on `supabase db reset` (local dev) — `supabase
-- db push` never applies them to a hosted project, and the seed's own
-- `insert ... on conflict do nothing` pattern can only ever add rows, not
-- retract one a previous seed run already inserted. A hosted project that
-- had the old seed applied keeps the vice_principal→student.view_benefits
-- leak forever unless something explicitly deletes it. This migration is
-- that explicit fix, mirroring the same three changes for any environment
-- (hosted or a pre-existing local one) that already ran the old seed.
delete from role_permissions
where permission_key = 'student.view_benefits'
  and role_id = (select id from roles where key = 'vice_principal');

insert into role_permissions (role_id, permission_key)
select (select id from roles where key = 'administrator'), 'announcement.publish_all'
where exists (select 1 from roles where key = 'administrator')
  and exists (select 1 from permissions where key = 'announcement.publish_all')
on conflict do nothing;

insert into role_permissions (role_id, permission_key)
select (select id from roles where key = 'class_teacher'), 'analytics.view'
where exists (select 1 from roles where key = 'class_teacher')
  and exists (select 1 from permissions where key = 'analytics.view')
on conflict do nothing;
