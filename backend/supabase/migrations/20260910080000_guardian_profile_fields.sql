-- Guardian profile fields shown on the student's Guardians card: NIC number
-- (unique per person), email, occupation and economic status. These live on
-- guardians itself, not per student-guardian pairing — a guardian's own
-- identity/contact/occupation is the same regardless of which of their
-- children the record is viewed through, and student_guardians already lets
-- one guardian be linked to multiple students without duplicating any of
-- this (section 4.3's guardian model).
alter table guardians add column if not exists nic_number text unique;
alter table guardians add column if not exists email text;
alter table guardians add column if not exists occupation text;
alter table guardians add column if not exists economic_status text;

-- Extends the one place the client reads guardian details from (section
-- 5.4) with the new fields, still gated by student.view_guardian_contact.
-- New columns are appended at the end so this stays a valid
-- CREATE OR REPLACE VIEW (existing column names/order are unchanged).
create or replace view student_guardians_contact
  with (security_invoker = true) as
  select
    sg.student_id,
    g.id as guardian_id,
    g.full_name,
    g.relationship,
    g.phone_primary,
    g.phone_alt,
    sg.is_primary,
    g.nic_number,
    g.email,
    g.occupation,
    g.economic_status
  from student_guardians sg
  join guardians g on g.id = sg.guardian_id;
