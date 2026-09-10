-- Address and GS (Grama Niladhari) division belong to the guardian, not the
-- student — a student's residential details are really their guardian's.
-- `address` already existed on guardians (20260907090003_people.sql) and was
-- simply never surfaced; `gs_division` is new there. Both student-level
-- columns (added by mistake in 20260910070000) are dropped and exposed
-- through the contact view instead.
alter table students drop column if exists address;
alter table students drop column if exists gs_division;

alter table guardians add column if not exists gs_division text;

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
    g.economic_status,
    g.address,
    g.gs_division
  from student_guardians sg
  join guardians g on g.id = sg.guardian_id;
