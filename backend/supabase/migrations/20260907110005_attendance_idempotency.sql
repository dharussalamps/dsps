-- Section 8 requires POST /submit-attendance to be "idempotent on
-- client_submission_id", but section 4.5's attendance_submissions table
-- has no such column — only unique(class_id, on_date), which can't tell a
-- retried request apart from a second teacher genuinely racing to submit
-- the same class. Without storing the id, the Edge Function can't
-- distinguish "return the original result" (rule 1: idempotency is
-- mandatory) from "409, someone else already submitted this" (rule 6).
alter table attendance_submissions
  add column client_submission_id uuid unique;
