-- Student's residential address and GS (Grama Niladhari) division, shown on
-- the student profile screen alongside the other identity fields.
alter table students add column if not exists address text;
alter table students add column if not exists gs_division text;
