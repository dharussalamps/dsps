-- Development-only sample data (AdminSpec.md section 13). NOT for production.
-- A representative subset, not the full ~900 students / 35 staff — enough
-- to exercise every RLS/scope path and the core screens. Scale it up later
-- with a generator script if load-testing is needed; the shape below (one
-- staff member holding two roles, one covered class, calendar overrides
-- inside the current term) is what section 13 asks for structurally.
--
-- Staff are seeded with auth_user_id = null. To sign in as one during
-- development: create the auth user (Studio > Authentication, or the
-- `supabase auth admin` API) with the same email, then run
--   update staff set auth_user_id = '<new auth uid>' where staff_no = '...';

insert into academic_years (label, starts_on, ends_on, is_current) values
  ('2026', '2026-01-05', '2026-12-04', true)
on conflict (label) do nothing;

insert into terms (academic_year_id, name, sequence, starts_on, ends_on)
select (select id from academic_years where label = '2026'), v.name, v.sequence, v.starts_on::date, v.ends_on::date
from (values
  ('Term 1', 1, '2026-01-05', '2026-04-03'),
  ('Term 2', 2, '2026-04-27', '2026-08-07'),
  ('Term 3', 3, '2026-08-31', '2026-12-04')
) as v(name, sequence, starts_on, ends_on)
on conflict (academic_year_id, sequence) do nothing;

-- Holiday, half day and exam day inside the current term (Term 3).
insert into calendar_days (on_date, day_type, label) values
  ('2026-09-04', 'holiday',  'School Holiday'),
  ('2026-09-25', 'half_day', 'Sports Day (Half Day)'),
  ('2026-10-09', 'exam',     'Term 3 Examination')
on conflict (on_date) do nothing;

insert into classes (grade_id, academic_year_id, name)
select (select id from grades where number = g.number),
       (select id from academic_years where label = '2026'), g.name
from (values (1, '1A'), (3, '3A'), (4, '4B')) as g(number, name)
on conflict (academic_year_id, name) do nothing;

-- Staff
insert into staff (staff_no, full_name, phone, email, joined_on, status) values
  ('P001',  'M. F. Rizwan',        '+94771000001', 'principal@dharussalam.edu.lk',        '2018-01-15', 'active'),
  ('V001',  'A. C. Fernando',      '+94771000002', 'vp@dharussalam.edu.lk',                '2019-01-10', 'active'),
  ('S001',  'Fathima Nazreen',     '+94771000003', 's.nazreen@dharussalam.edu.lk',         '2016-06-01', 'active'),
  ('T001',  'K. Kavindi Perera',   '+94771000004', 't.kavindi@dharussalam.edu.lk',         '2020-01-20', 'active'),
  ('T002',  'S. Thanuja Kumar',    '+94771000005', 't.thanuja@dharussalam.edu.lk',         '2021-03-01', 'active'),
  ('T003',  'Mohamed Rusdi',       '+94771000006', 't.rusdi@dharussalam.edu.lk',           '2022-05-16', 'active'),
  ('A001',  'R. D. Silva',         '+94771000007', 'admin@dharussalam.edu.lk',             '2017-02-01', 'active'),
  ('ST001', 'N. Priyantha',        '+94771000008', 'clerk@dharussalam.edu.lk',             '2023-01-09', 'active')
on conflict (staff_no) do nothing;

update classes set class_teacher_id = (select id from staff where staff_no = 'T001') where name = '1A';
update classes set class_teacher_id = (select id from staff where staff_no = 'T002') where name = '3A';
update classes set class_teacher_id = (select id from staff where staff_no = 'S001') where name = '4B';

-- Roles: S001 deliberately holds two roles (sectional_head for grade 4,
-- and class_teacher for 4B) per section 13's dual-role requirement.
insert into staff_roles (staff_id, role_id, scope_type, scope_id)
select st.id, r.id, x.scope_type::scope_type,
       case x.scope_ref
         when 'grade:4'   then (select id from grades where number = 4)
         when 'class:1A'  then (select id from classes where name = '1A')
         when 'class:3A'  then (select id from classes where name = '3A')
         when 'class:4B'  then (select id from classes where name = '4B')
         else null
       end
from (values
  ('P001',  'principal',      'school', null),
  ('V001',  'vice_principal', 'school', null),
  ('S001',  'sectional_head', 'grade',  'grade:4'),
  ('S001',  'class_teacher',  'class',  'class:4B'),
  ('T001',  'class_teacher',  'class',  'class:1A'),
  ('T002',  'class_teacher',  'class',  'class:3A'),
  ('T003',  'staff',          'self',   null),
  ('A001',  'administrator',  'school', null),
  ('ST001', 'staff',          'self',   null)
) as x(staff_no, role_key, scope_type, scope_ref)
join staff st on st.staff_no = x.staff_no
join roles r on r.key = x.role_key
where not exists (
  select 1 from staff_roles sr
  where sr.staff_id = st.id and sr.role_id = r.id and sr.revoked_at is null
);

-- T003 covers 1A for a few days around "today" (2026-09-07) while T001 is
-- away, exercising the covered path. 3A (T002) is deliberately left with
-- no cover assignment, exercising the uncovered path — full "on leave"
-- state lands with the leave module (build task 13).
insert into cover_assignments (class_id, staff_id, starts_on, ends_on, reason, assigned_by)
select
  (select id from classes where name = '1A'),
  (select id from staff where staff_no = 'T003'),
  '2026-09-05', '2026-09-09',
  'Class teacher on medical leave',
  (select id from staff where staff_no = 'P001')
where not exists (
  select 1 from cover_assignments
  where class_id = (select id from classes where name = '1A')
    and staff_id = (select id from staff where staff_no = 'T003')
    and starts_on = '2026-09-05'
);

-- Students + guardians, six per class.
insert into students (admission_no, full_name, status) values
  ('ADM2026-0001', 'Ahamed Zayan',        'active'),
  ('ADM2026-0002', 'Fathima Rifka',       'active'),
  ('ADM2026-0003', 'Kasun Dilshan',       'active'),
  ('ADM2026-0004', 'Nethmi Sewwandi',     'active'),
  ('ADM2026-0005', 'Mohamed Aadhil',      'active'),
  ('ADM2026-0006', 'Aisha Farhana',       'active'),
  ('ADM2026-0007', 'Ravindu Tharusha',    'active'),
  ('ADM2026-0008', 'Yasodha Priyangika',  'active'),
  ('ADM2026-0009', 'Mohamed Rifky',       'active'),
  ('ADM2026-0010', 'Nasreen Fazeela',     'active'),
  ('ADM2026-0011', 'Sithija Bandara',     'active'),
  ('ADM2026-0012', 'Thevindi Perera',     'active'),
  ('ADM2026-0013', 'Ahamed Nawfal',       'active'),
  ('ADM2026-0014', 'Sadhya Wickramasinghe','active'),
  ('ADM2026-0015', 'Rusdha Rukshana',     'active'),
  ('ADM2026-0016', 'Chethiya Kumara',     'active'),
  ('ADM2026-0017', 'Mohamed Suhail',      'active'),
  ('ADM2026-0018', 'Ishara Madushani',    'active')
on conflict (admission_no) do nothing;

insert into student_enrolments (student_id, class_id, academic_year_id, roll_no)
select s.id, c.class_id, (select id from academic_years where label = '2026'), x.roll_no
from (values
  ('ADM2026-0001', '1A', '1'), ('ADM2026-0002', '1A', '2'), ('ADM2026-0003', '1A', '3'),
  ('ADM2026-0004', '1A', '4'), ('ADM2026-0005', '1A', '5'), ('ADM2026-0006', '1A', '6'),
  ('ADM2026-0007', '3A', '1'), ('ADM2026-0008', '3A', '2'), ('ADM2026-0009', '3A', '3'),
  ('ADM2026-0010', '3A', '4'), ('ADM2026-0011', '3A', '5'), ('ADM2026-0012', '3A', '6'),
  ('ADM2026-0013', '4B', '1'), ('ADM2026-0014', '4B', '2'), ('ADM2026-0015', '4B', '3'),
  ('ADM2026-0016', '4B', '4'), ('ADM2026-0017', '4B', '5'), ('ADM2026-0018', '4B', '6')
) as x(admission_no, class_name, roll_no)
join students s on s.admission_no = x.admission_no
join (select id as class_id, name from classes) c on c.name = x.class_name
on conflict (student_id, academic_year_id) do nothing;

insert into guardians (full_name, relationship, phone_primary)
select 'Guardian of ' || s.full_name, 'parent', '+9477' || lpad((row_number() over (order by s.admission_no))::text, 7, '0')
from students s
where not exists (
  select 1 from student_guardians sg
  join guardians g on g.id = sg.guardian_id
  where sg.student_id = s.id
);

insert into student_guardians (student_id, guardian_id, is_primary)
select s.id, g.id, true
from students s
join guardians g on g.full_name = 'Guardian of ' || s.full_name
on conflict (student_id, guardian_id) do nothing;
