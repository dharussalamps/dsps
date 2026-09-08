-- AdminSpec.md section 6.1 — is a date a school day. Every scheduled job
-- (section 7, build task 11) checks this first and exits if false; the
-- attendance edit-window and marking screens rely on it too.
create or replace function is_school_day(p_date date) returns boolean
language sql stable as $$
  select
    case
      when (select day_type from calendar_days where on_date = p_date)
           in ('holiday','closure') then false
      when (select day_type from calendar_days where on_date = p_date) is not null
           then true                                   -- half_day and exam count
      when not exists (select 1 from terms
                       where p_date between starts_on and ends_on) then false
      when not exists (select 1 from school_settings
                       where extract(isodow from p_date)::smallint
                             = any (working_weekdays)) then false
      else true
    end;
$$;

-- Readable by any signed-in staff (used client-side to decide whether to
-- show the marking prompt, and by the offline cache to pre-compute the
-- current month's school days).
grant execute on function is_school_day(date) to authenticated;
