-- Bug: adding a future academic year (e.g. 2027, while 2026 is still
-- underway) immediately flagged it is_current — addAcademicYear
-- (apps/admin/src/features/calendar/api.ts) unconditionally flipped the new
-- row to current on insert, so the "current" badge in the Academic Years
-- card jumped to whichever year was created last instead of the one that
-- actually contains today. The "current" year should be determined by
-- today's date against starts_on/ends_on, not by insertion order.
--
-- sync_current_academic_year() picks the academic year whose range contains
-- current_date (the latest-starting one, if ranges somehow overlap) and
-- flags it as the only is_current row — leaving the flag untouched when no
-- year covers today (e.g. a gap between years), so the app is never left
-- with zero current years. A statement-level trigger runs it after any
-- insert/update of the date columns, and a daily cron job re-runs it so the
-- flag still rolls over at a year boundary even on a day nothing is edited
-- (same pattern as the other daily/periodic jobs in
-- 20260907110004_scheduled_jobs.sql).

create or replace function sync_current_academic_year() returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from academic_years
  where current_date between starts_on and ends_on
  order by starts_on desc
  limit 1;

  if v_id is not null then
    update academic_years set is_current = false where id <> v_id and is_current;
    update academic_years set is_current = true where id = v_id and not is_current;
  end if;
end;
$$;
grant execute on function sync_current_academic_year() to authenticated;

create or replace function academic_years_sync_current_trigger() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform sync_current_academic_year();
  return null;
end;
$$;

drop trigger if exists academic_years_sync_current on academic_years;
create trigger academic_years_sync_current
after insert or delete or update of starts_on, ends_on on academic_years
for each statement execute function academic_years_sync_current_trigger();

select cron.schedule('sync_current_academic_year', '5 0 * * *', 'select sync_current_academic_year()');

-- Fix up whatever is already in the table (e.g. a future year created via
-- the old unconditional makeCurrent logic) right away rather than waiting
-- for the next edit or the next cron tick.
select sync_current_academic_year();
