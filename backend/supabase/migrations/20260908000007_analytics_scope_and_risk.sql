-- FR-ANL-02 needs a real, scope-respecting way to read attendance_summaries
-- before "students at risk" can be built at all — and the existing policy
-- (20260907190001_analytics.sql) only ever worked for a school-scoped
-- viewer. Its own comment already flags the reason: has_permission()'s
-- 'grade' branch resolves through a *class*, but 'grade'/'student'/'school'
-- summary rows have no class_id to give it — a grade-scoped sectional head
-- (or a class-scoped class_teacher, for their own students) could never
-- pass the old `scope_type <> 'class' and has_permission(..., 'analytics.view')`
-- check, regardless of which grade or student the row was actually about.
create or replace function can_view_attendance_summary(p_scope_type text, p_scope_id uuid)
returns boolean
language sql
stable
as $$
  select case p_scope_type
    when 'school' then has_permission(current_staff_id(), 'analytics.view')
    when 'class' then has_permission(current_staff_id(), 'analytics.view', p_scope_id)
    when 'student' then has_permission(current_staff_id(), 'analytics.view', student_current_class_id(p_scope_id))
    when 'grade' then
      has_permission(current_staff_id(), 'analytics.view')
      or exists (
        select 1 from staff_roles sr
        join role_permissions rp on rp.role_id = sr.role_id
        where sr.staff_id = current_staff_id() and sr.revoked_at is null
          and rp.permission_key = 'analytics.view' and sr.scope_type = 'grade' and sr.scope_id = p_scope_id
      )
    else false
  end;
$$;
grant execute on function can_view_attendance_summary(text, uuid) to authenticated;

drop policy if exists read_attendance_summaries on attendance_summaries;
create policy read_attendance_summaries on attendance_summaries for select
  using (can_view_attendance_summary(scope_type, scope_id));

-- FR-ANL-02: "students at risk by consecutive absence or low attendance are
-- listed, most severe first." detect_absence_risk (section 7) already
-- computes exactly this per student and fires notifications, but never
-- exposed it as a queryable list — there was no way to actually see the
-- list section 10's StudentSearch/Home screens are supposed to show
-- (the FR names a *list*, not just point-in-time alerts). Reuses
-- consecutive_absences() and the same thresholds (school_settings) the
-- scheduled job already uses, filtered through can_view_attendance_summary
-- so it returns exactly what the caller's own analytics.view scope allows.
create or replace function students_at_risk()
returns table(
  student_id uuid, full_name text, class_name text,
  consecutive_absent_days integer, term_pct numeric
)
language sql
stable
as $$
  select
    s.id, s.full_name, c.name,
    consecutive_absences(s.id, current_date),
    coalesce(asu.pct, 100)
  from students s
  join student_enrolments se on se.student_id = s.id
  join academic_years ay on ay.id = se.academic_year_id and ay.is_current
  join classes c on c.id = se.class_id
  left join attendance_summaries asu on asu.scope_type = 'student' and asu.scope_id = s.id
    and asu.term_id = (select id from terms where current_date between starts_on and ends_on limit 1)
  where s.status = 'active'
    and can_view_attendance_summary('class', c.id)
    and (
      consecutive_absences(s.id, current_date) >= (select risk_consecutive_days from school_settings)
      or coalesce(asu.pct, 100) < (select risk_attendance_pct from school_settings)
    )
  order by consecutive_absences(s.id, current_date) desc, coalesce(asu.pct, 100) asc;
$$;
grant execute on function students_at_risk() to authenticated;
