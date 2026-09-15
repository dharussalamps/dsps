-- Academic Structure screen: subjects now get the same edit/delete
-- treatment as grades and classes (20260915000000_grade_class_can_delete.sql)
-- — this is that migration's third leg. subjects is referenced by exactly
-- three tables (grade_subjects.subject_id, class_subject_teachers.subject_id,
-- mark_sheets.subject_id — confirmed against every migration under this
-- folder, none cascade). If a future migration adds another FK to
-- subjects, it needs a matching line here or this check will under-report
-- — the actual delete stays safe regardless since it still goes through
-- the real FK constraint.

create or replace function subject_can_delete(p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from grade_subjects where subject_id = p_subject_id)
     and not exists (select 1 from class_subject_teachers where subject_id = p_subject_id)
     and not exists (select 1 from mark_sheets where subject_id = p_subject_id);
$$;
grant execute on function subject_can_delete(uuid) to authenticated;
