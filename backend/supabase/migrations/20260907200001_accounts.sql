-- AdminSpec.md build task 21 — UserAccounts screen: "Create, assign role
-- with scope, deactivate." Creating a staff row is part of account.manage's
-- own job description ("Create and manage user accounts and role
-- assignments" — section 5.1), not just staff.manage's, so the write
-- policy on staff is widened to accept either. staff_roles' write policy
-- already only required account.manage (see the phase-1 migration).
--
-- Note on scope (see docs/AdminSpec.md section 17): actually creating a
-- sign-in (an auth.users row) requires Supabase's admin API, which can
-- only be called with the service role — never from this app, which never
-- holds that key. Section 8 lists exactly 8 required Edge Functions and
-- account creation isn't one of them, so this build treats "give someone
-- a login" as an out-of-band administrative step (Supabase Studio, or the
-- admin API from a trusted context) — the same thing the dev seed data's
-- own comment already says to do — and keeps this screen to what RLS can
-- safely do directly: create the staff record, assign roles/scope,
-- deactivate.
drop policy if exists write_staff on staff;
create policy write_staff on staff for all
  using (has_permission(current_staff_id(), 'staff.manage') or has_permission(current_staff_id(), 'account.manage'))
  with check (has_permission(current_staff_id(), 'staff.manage') or has_permission(current_staff_id(), 'account.manage'));
