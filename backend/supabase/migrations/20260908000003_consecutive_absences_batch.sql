-- NFR-PRF-02 follow-up: fetchExistingSubmission (client) previously called
-- consecutive_absences() once per absentee in a loop — fine for the two or
-- three absentees in dev sample data, but an N+1 round trip for a real
-- class. Batches the same per-student window scan into one call.
create or replace function consecutive_absences_batch(p_student_ids uuid[], p_as_of date)
returns table(student_id uuid, days integer)
language sql
stable
as $$
  select s.id, consecutive_absences(s.id, p_as_of)
  from unnest(p_student_ids) as s(id);
$$;
grant execute on function consecutive_absences_batch(uuid[], date) to authenticated;
