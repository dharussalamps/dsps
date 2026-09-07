-- Grades 1-5 (spec: "primary school ... grades 1-5") and the core primary
-- curriculum subjects, mapped per grade. Safe to re-run.

insert into grades (number, name) values
  (1, 'Grade 1'), (2, 'Grade 2'), (3, 'Grade 3'), (4, 'Grade 4'), (5, 'Grade 5')
on conflict (number) do update set name = excluded.name;

insert into subjects (name, code) values
  ('Sinhala Language',              'SIN'),
  ('Tamil Language',                'TAM'),
  ('English Language',              'ENG'),
  ('Mathematics',                   'MATH'),
  ('Environmental Studies',         'ENV'),
  ('Religion',                      'REL'),
  ('Aesthetic Education',           'AES'),
  ('Health & Physical Education',   'HPE'),
  ('Information & Communication Technology', 'ICT')
on conflict (code) do update set name = excluded.name;

-- All subjects for all grades except ICT, which starts at grade 3.
insert into grade_subjects (grade_id, subject_id)
select g.id, s.id
from grades g
cross join subjects s
where s.code <> 'ICT'
on conflict do nothing;

insert into grade_subjects (grade_id, subject_id)
select g.id, s.id
from grades g
cross join subjects s
where s.code = 'ICT' and g.number >= 3
on conflict do nothing;
