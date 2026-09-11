-- Maternity leave is a 3-phase chain, each phase system-computed from a
-- single date: paid maternity (84 school days from a chosen start date),
-- then an optional Half Pay Leave extension (84 calendar days), then an
-- optional No-Pay Leave extension (84 calendar days). Modeled as one
-- 'maternity' leave_types row with a phase column, rather than three
-- separate leave types — each phase is still a normal leave_requests row
-- going through the existing approve_leave()/reject_leave() flow
-- unchanged, so the principal approves each phase separately.

create type maternity_phase as enum ('paid', 'half_pay', 'no_pay');

alter table leave_requests
  add column maternity_phase maternity_phase,
  add column extends_request_id uuid references leave_requests(id) unique;

-- Mirrors is_school_day() (20260907100003_is_school_day.sql): finds the
-- date of the p_school_days-th school day counting forward from p_start
-- inclusive (p_start itself counts if it's a school day). A maternity
-- leave's 84-school-day span can run for months and cross term/academic
-- year boundaries, so this is computed server-side against the real
-- calendar rather than trusting however much calendar data a client has
-- loaded.
create or replace function add_school_days(p_start date, p_school_days int)
returns date
language plpgsql stable as $$
declare
  v_date date := p_start;
  v_counted int := 0;
begin
  while v_counted < p_school_days loop
    if is_school_day(v_date) then
      v_counted := v_counted + 1;
    end if;
    if v_counted >= p_school_days then
      return v_date;
    end if;
    v_date := v_date + 1;
  end loop;
  return v_date;
end;
$$;
grant execute on function add_school_days(date, integer) to authenticated;
