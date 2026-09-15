-- Academic Calendar screen: academic years and terms are now editable and
-- deletable from the UI (deleteAcademicYear/deleteTerm in
-- apps/admin/src/features/calendar/api.ts already rely on the underlying FK
-- constraints to refuse the delete outright), same pattern as
-- grade_can_delete/class_can_delete (20260915000000_grade_class_can_delete.sql)
-- and subject_can_delete (20260915010000_subject_can_delete.sql) — these two
-- functions expose the "still linked?" question as a cheap read so the UI
-- can decide whether to show the Delete button at all.
--
-- academic_years is referenced by seven tables (confirmed against every
-- migration under this folder): terms.academic_year_id cascades with the
-- year so it never blocks the delete; classes, student_enrolments,
-- leave_balances, benefits, responsibilities, and events all reference it
-- without cascade, so any of those block it. A year currently flagged
-- is_current is never deletable either — the app always needs exactly one.
--
-- terms is referenced by two tables: mark_sheets.term_id (not null) and
-- attendance_summaries.term_id (nullable, but still a blocking FK with no
-- action on delete). If a future migration adds another FK to either table,
-- it needs a matching line here or this check will under-report — the
-- actual delete stays safe regardless since it still goes through the real
-- FK constraint.

create or replace function academic_year_can_delete(p_academic_year_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from academic_years where id = p_academic_year_id and is_current)
     and not exists (select 1 from classes where academic_year_id = p_academic_year_id)
     and not exists (select 1 from student_enrolments where academic_year_id = p_academic_year_id)
     and not exists (select 1 from leave_balances where academic_year_id = p_academic_year_id)
     and not exists (select 1 from benefits where academic_year_id = p_academic_year_id)
     and not exists (select 1 from responsibilities where academic_year_id = p_academic_year_id)
     and not exists (select 1 from events where academic_year_id = p_academic_year_id);
$$;
grant execute on function academic_year_can_delete(uuid) to authenticated;

create or replace function term_can_delete(p_term_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from mark_sheets where term_id = p_term_id)
     and not exists (select 1 from attendance_summaries where term_id = p_term_id);
$$;
grant execute on function term_can_delete(uuid) to authenticated;
