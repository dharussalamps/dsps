-- Development-only sample data, phase 2: fills in every feature module that
-- 900_dev_sample_data.sql left empty (marks, attendance history, leave,
-- announcements, events/diary, inventory, achievements/memberships/
-- benefits, responsibilities, notifications) so each screen in apps/admin
-- has something to render. NOT for production. Idempotent throughout.

-- ---------------------------------------------------------------------
-- Class/subject/teacher assignments (needed before mark sheets can exist).
-- Each class's own class teacher teaches every subject for that grade —
-- standard for a primary-school single-teacher classroom.
-- ---------------------------------------------------------------------
insert into class_subject_teachers (class_id, subject_id, staff_id)
select c.id, gs.subject_id, c.class_teacher_id
from classes c
join grade_subjects gs on gs.grade_id = c.grade_id
where not exists (
  select 1 from class_subject_teachers cst
  where cst.class_id = c.id and cst.subject_id = gs.subject_id
);

-- ---------------------------------------------------------------------
-- Student attendance: the school week leading up to "today", skipping the
-- 09-03 holiday. Most present, a handful absent/late for variety.
-- ---------------------------------------------------------------------
insert into student_attendance (student_id, class_id, on_date, status, reason, marked_by)
select se.student_id, se.class_id, d.on_date,
  case
    when (d.on_date = '2026-09-02' and se.roll_no in ('2','3')) then 'absent'
    when (d.on_date = '2026-09-07' and se.roll_no = '4') then 'late'
    else 'present'
  end::attendance_status,
  case when (d.on_date = '2026-09-02' and se.roll_no in ('2','3')) then 'Informed by guardian' end,
  coalesce(
    (select staff_id from cover_assignments ca where ca.class_id = se.class_id and d.on_date between ca.starts_on and ca.ends_on),
    (select class_teacher_id from classes c where c.id = se.class_id)
  )
from student_enrolments se
cross join (values ('2026-09-01'::date), ('2026-09-02'::date), ('2026-09-07'::date), ('2026-09-08'::date)) as d(on_date)
where not exists (
  select 1 from student_attendance sa where sa.student_id = se.student_id and sa.on_date = d.on_date
);

-- ---------------------------------------------------------------------
-- Staff attendance history (2026-09-07 is already seeded, oddly as
-- "absent" for everyone from earlier RPC testing — leave it as-is and
-- only add the days around it). T001 was on medical leave 09-04..09-08
-- per the existing cover_assignments row; reflect that as on_leave.
-- ---------------------------------------------------------------------
insert into staff_attendance (staff_id, on_date, status, checked_in_at)
select s.id, d.on_date, 'present', d.on_date + time '07:25'
from staff s
cross join (values ('2026-09-01'::date), ('2026-09-02'::date)) as d(on_date)
where s.staff_no <> 'T001'
  and not exists (select 1 from staff_attendance sa where sa.staff_id = s.id and sa.on_date = d.on_date)
on conflict (staff_id, on_date) do nothing;

insert into staff_attendance (staff_id, on_date, status)
select (select id from staff where staff_no = 'T001'), d.on_date, 'on_leave'
from (values ('2026-09-04'::date), ('2026-09-05'::date), ('2026-09-06'::date), ('2026-09-08'::date)) as d(on_date)
on conflict (staff_id, on_date) do nothing;

update staff_attendance set status = 'on_leave', checked_in_at = null
where staff_id = (select id from staff where staff_no = 'T001') and on_date = '2026-09-07';

-- ---------------------------------------------------------------------
-- Leave: T001's medical leave (matching the existing cover_assignments
-- row) comes in already-approved; T002 has a pending request awaiting
-- P001's decision; T003's earlier request was rejected. Each insert starts
-- 'pending' so the leave_request_submitted notification trigger fires
-- once with an accurate "just submitted" notification, then is updated to
-- its final status separately (an UPDATE doesn't re-fire that trigger).
-- ---------------------------------------------------------------------
insert into leave_requests (staff_id, requested_by, leave_type_id, starts_on, ends_on, day_count, reason, status)
select (select id from staff where staff_no = 'T001'),
       (select id from staff where staff_no = 'T001'),
       (select id from leave_types where key = 'medical'),
       '2026-09-04', '2026-09-08', 5, 'Recovering from viral fever, doctor advised rest.', 'pending'
where not exists (
  select 1 from leave_requests where staff_id = (select id from staff where staff_no = 'T001') and starts_on = '2026-09-04'
);
update leave_requests
set status = 'approved',
    decided_by = (select id from staff where staff_no = 'P001'),
    decided_at = '2026-09-04 08:10:00+05:30',
    remarks = 'Get well soon. T003 covering 1A.',
    cover_assignment_id = (select id from cover_assignments where class_id = (select id from classes where name = '1A') and starts_on = '2026-09-04')
where staff_id = (select id from staff where staff_no = 'T001') and starts_on = '2026-09-04' and status = 'pending';

insert into leave_requests (staff_id, requested_by, leave_type_id, starts_on, ends_on, day_count, reason, status)
select (select id from staff where staff_no = 'T002'),
       (select id from staff where staff_no = 'T002'),
       (select id from leave_types where key = 'duty'),
       '2026-09-15', '2026-09-16', 2, 'Attending zonal science fair as coordinator.', 'pending'
where not exists (
  select 1 from leave_requests where staff_id = (select id from staff where staff_no = 'T002') and starts_on = '2026-09-15'
);

insert into leave_requests (staff_id, requested_by, leave_type_id, starts_on, ends_on, day_count, reason, status)
select (select id from staff where staff_no = 'T003'),
       (select id from staff where staff_no = 'T003'),
       (select id from leave_types where key = 'casual'),
       '2026-08-20', '2026-08-20', 1, 'Personal matter.', 'pending'
where not exists (
  select 1 from leave_requests where staff_id = (select id from staff where staff_no = 'T003') and starts_on = '2026-08-20'
);
update leave_requests
set status = 'rejected',
    decided_by = (select id from staff where staff_no = 'P001'),
    decided_at = '2026-08-19 16:00:00+05:30',
    remarks = 'No cover available that week, please reapply for a later date.'
where staff_id = (select id from staff where staff_no = 'T003') and starts_on = '2026-08-20' and status = 'pending';

insert into leave_balances (staff_id, leave_type_id, academic_year_id, entitled, used)
select s.id, lt.id, (select id from academic_years where is_current), lt.annual_entitlement,
  case when s.staff_no = 'T001' and lt.key = 'medical' then 5 else 0 end
from staff s
cross join leave_types lt
where s.staff_no in ('T001', 'T002', 'T003', 'S001')
  and lt.key in ('casual', 'medical', 'duty')
on conflict (staff_id, leave_type_id, academic_year_id) do nothing;

-- ---------------------------------------------------------------------
-- Marks: one submitted sheet, one draft-in-progress, one reopened — the
-- three states MarkEntryScreen/MarksReviewScreen distinguish.
-- ---------------------------------------------------------------------
insert into mark_sheets (class_id, subject_id, term_id, max_score, status, submitted_by, submitted_at)
select (select id from classes where name = '1A'),
       (select id from subjects where code = 'MATH'),
       (select id from terms where sequence = 3),
       100, 'submitted',
       (select id from staff where staff_no = 'T001'),
       '2026-09-06 14:00:00+05:30'
where not exists (
  select 1 from mark_sheets where class_id = (select id from classes where name = '1A')
    and subject_id = (select id from subjects where code = 'MATH')
    and term_id = (select id from terms where sequence = 3)
);

insert into marks (mark_sheet_id, student_id, score, entered_by)
select ms.id, se.student_id, 55 + (row_number() over (order by se.roll_no)) * 6, (select id from staff where staff_no = 'T001')
from student_enrolments se
join mark_sheets ms on ms.class_id = se.class_id and ms.subject_id = (select id from subjects where code = 'MATH') and ms.term_id = (select id from terms where sequence = 3)
where se.class_id = (select id from classes where name = '1A')
on conflict (mark_sheet_id, student_id) do nothing;

insert into mark_sheets (class_id, subject_id, term_id, max_score, status)
select (select id from classes where name = '1A'),
       (select id from subjects where code = 'ENG'),
       (select id from terms where sequence = 3),
       100, 'draft'
where not exists (
  select 1 from mark_sheets where class_id = (select id from classes where name = '1A')
    and subject_id = (select id from subjects where code = 'ENG')
    and term_id = (select id from terms where sequence = 3)
);

insert into marks (mark_sheet_id, student_id, score, entered_by)
select ms.id, se.student_id,
  case when se.roll_no in ('1', '2', '3') then 60 + (row_number() over (order by se.roll_no)) * 5 else null end,
  (select id from staff where staff_no = 'T001')
from student_enrolments se
join mark_sheets ms on ms.class_id = se.class_id and ms.subject_id = (select id from subjects where code = 'ENG') and ms.term_id = (select id from terms where sequence = 3)
where se.class_id = (select id from classes where name = '1A')
on conflict (mark_sheet_id, student_id) do nothing;

insert into mark_sheets (class_id, subject_id, term_id, max_score, status, submitted_by, submitted_at, reopened_by)
select (select id from classes where name = '4B'),
       (select id from subjects where code = 'MATH'),
       (select id from terms where sequence = 3),
       100, 'reopened',
       (select id from staff where staff_no = 'S001'),
       '2026-09-05 11:00:00+05:30',
       (select id from staff where staff_no = 'P001')
where not exists (
  select 1 from mark_sheets where class_id = (select id from classes where name = '4B')
    and subject_id = (select id from subjects where code = 'MATH')
    and term_id = (select id from terms where sequence = 3)
);

insert into marks (mark_sheet_id, student_id, score, entered_by)
select ms.id, se.student_id, 48 + (row_number() over (order by se.roll_no)) * 7, (select id from staff where staff_no = 'S001')
from student_enrolments se
join mark_sheets ms on ms.class_id = se.class_id and ms.subject_id = (select id from subjects where code = 'MATH') and ms.term_id = (select id from terms where sequence = 3)
where se.class_id = (select id from classes where name = '4B')
on conflict (mark_sheet_id, student_id) do nothing;

-- ---------------------------------------------------------------------
-- Announcements, across all four audience types.
-- ---------------------------------------------------------------------
insert into announcements (title, body, priority, audience, audience_ids, publish_at, author_id)
select 'Sports Day - Half Day on 25th', 'School closes at 12:30pm for Sports Day preparations. Buses will run on the half-day schedule.', 1, 'all_staff', null, '2026-09-06 09:00:00+05:30', (select id from staff where staff_no = 'P001')
where not exists (select 1 from announcements where title = 'Sports Day - Half Day on 25th');

insert into announcements (title, body, priority, audience, audience_ids, publish_at, author_id)
select 'Grade 4 assembly moved to Friday', 'This week''s grade assembly moves to Friday 8am in the main hall due to the hall being used for exam setup on Thursday.', 0, 'section', array[(select id from grades where number = 4)], '2026-09-07 07:30:00+05:30', (select id from staff where staff_no = 'S001')
where not exists (select 1 from announcements where title = 'Grade 4 assembly moved to Friday');

insert into announcements (title, body, priority, audience, audience_ids, publish_at, author_id)
select 'Class 1A: school trip consent forms due', 'Please collect consent forms for the museum trip from parents by Wednesday.', 0, 'class', array[(select id from classes where name = '1A')], '2026-09-07 12:00:00+05:30', (select id from staff where staff_no = 'T003')
where not exists (select 1 from announcements where title = 'Class 1A: school trip consent forms due');

insert into announcements (title, body, priority, audience, audience_ids, publish_at, author_id)
select 'Inventory count needed by Friday', 'Please complete the term-end stock count for the store room and submit the sheet to the office.', 0, 'individuals', array[(select id from staff where staff_no = 'ST001')], '2026-09-07 13:00:00+05:30', (select id from staff where staff_no = 'A001')
where not exists (select 1 from announcements where title = 'Inventory count needed by Friday');

insert into announcement_reads (announcement_id, staff_id, read_at)
select a.id, s.id, a.publish_at + interval '2 hours'
from announcements a
cross join staff s
where a.title = 'Sports Day - Half Day on 25th' and s.staff_no in ('T001', 'T002', 'V001')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Events + diary.
-- ---------------------------------------------------------------------
insert into events (title, description, category, starts_on, ends_on, location, responsible_id, academic_year_id, created_by)
select 'Sports Day', 'Annual inter-house sports meet.', 'sports', '2026-09-25', '2026-09-25', 'School Grounds', (select id from staff where staff_no = 'V001'), (select id from academic_years where is_current), (select id from staff where staff_no = 'P001')
where not exists (select 1 from events where title = 'Sports Day' and starts_on = '2026-09-25');

insert into events (title, description, category, starts_on, ends_on, location, responsible_id, academic_year_id, created_by)
select 'Term 3 Examinations', 'End-of-term written examinations for all grades.', 'exam', '2026-10-09', '2026-10-16', 'Classrooms', (select id from staff where staff_no = 'S001'), (select id from academic_years where is_current), (select id from staff where staff_no = 'P001')
where not exists (select 1 from events where title = 'Term 3 Examinations' and starts_on = '2026-10-09');

insert into events (title, description, category, starts_on, ends_on, location, responsible_id, academic_year_id, created_by)
select 'Independence Day Assembly', 'Special assembly with flag hoisting and cultural items.', 'assembly', '2026-08-04', '2026-08-04', 'Main Hall', (select id from staff where staff_no = 'A001'), (select id from academic_years where is_current), (select id from staff where staff_no = 'P001')
where not exists (select 1 from events where title = 'Independence Day Assembly' and starts_on = '2026-08-04');

insert into diary_entries (on_date, title, body, event_id, author_id)
select '2026-09-07', 'Sports Day practice began', 'House captains held the first practice session for track events after school.', (select id from events where title = 'Sports Day'), (select id from staff where staff_no = 'V001')
where not exists (select 1 from diary_entries where title = 'Sports Day practice began');

insert into diary_entries (on_date, title, body, author_id)
select '2026-09-02', 'Grade 1A museum trip planning', 'Discussed logistics for the upcoming museum trip with T003 covering the class.', (select id from staff where staff_no = 'T003')
where not exists (select 1 from diary_entries where title = 'Grade 1A museum trip planning');

-- ---------------------------------------------------------------------
-- Inventory: one healthy stock level, two below their min_quantity (to
-- exercise the low-stock indicator), and a write-off transaction.
-- ---------------------------------------------------------------------
insert into inventory_items (name, category, location, condition, min_quantity, code)
select 'Projector - Epson EB-X05', 'AV Equipment', 'Store Room 1', 'good', 1, 'INV-AV-001'
where not exists (select 1 from inventory_items where code = 'INV-AV-001');
insert into inventory_items (name, category, location, condition, min_quantity, code)
select 'Football', 'Sports', 'Sports Store', 'fair', 5, 'INV-SPT-010'
where not exists (select 1 from inventory_items where code = 'INV-SPT-010');
insert into inventory_items (name, category, location, condition, min_quantity, code)
select 'Whiteboard Markers (Box)', 'Stationery', 'Store Room 1', 'new', 10, 'INV-STA-020'
where not exists (select 1 from inventory_items where code = 'INV-STA-020');

insert into inventory_transactions (item_id, txn_type, quantity, note, actor_id)
select (select id from inventory_items where code = 'INV-AV-001'), 'receipt', 3, 'Initial stock', (select id from staff where staff_no = 'ST001')
where not exists (select 1 from inventory_transactions where item_id = (select id from inventory_items where code = 'INV-AV-001'));
insert into inventory_transactions (item_id, txn_type, quantity, note, actor_id)
select (select id from inventory_items where code = 'INV-AV-001'), 'issue', 1, 'Issued to Grade 4B for class use', (select id from staff where staff_no = 'ST001')
where (select count(*) from inventory_transactions where item_id = (select id from inventory_items where code = 'INV-AV-001')) < 2;

insert into inventory_transactions (item_id, txn_type, quantity, note, actor_id)
select (select id from inventory_items where code = 'INV-SPT-010'), 'receipt', 20, 'Initial stock', (select id from staff where staff_no = 'ST001')
where not exists (select 1 from inventory_transactions where item_id = (select id from inventory_items where code = 'INV-SPT-010'));
insert into inventory_transactions (item_id, txn_type, quantity, note, actor_id)
select (select id from inventory_items where code = 'INV-SPT-010'), 'issue', 16, 'Issued for Sports Day practice', (select id from staff where staff_no = 'V001')
where (select count(*) from inventory_transactions where item_id = (select id from inventory_items where code = 'INV-SPT-010')) < 2;

insert into inventory_transactions (item_id, txn_type, quantity, note, actor_id)
select (select id from inventory_items where code = 'INV-STA-020'), 'receipt', 12, 'Initial stock', (select id from staff where staff_no = 'ST001')
where not exists (select 1 from inventory_transactions where item_id = (select id from inventory_items where code = 'INV-STA-020'));
insert into inventory_transactions (item_id, txn_type, quantity, note, actor_id)
select (select id from inventory_items where code = 'INV-STA-020'), 'issue', 3, 'Issued to office', (select id from staff where staff_no = 'ST001')
where (select count(*) from inventory_transactions where item_id = (select id from inventory_items where code = 'INV-STA-020')) < 2;
insert into inventory_transactions (item_id, txn_type, quantity, note, actor_id)
select (select id from inventory_items where code = 'INV-STA-020'), 'write_off', 1, 'Box damaged by water leak', (select id from staff where staff_no = 'ST001')
where (select count(*) from inventory_transactions where item_id = (select id from inventory_items where code = 'INV-STA-020')) < 3;

-- ---------------------------------------------------------------------
-- Student profile sections: achievements, memberships, benefits.
-- ---------------------------------------------------------------------
insert into achievements (student_id, title, category, level, achieved_on, recorded_by)
select (select id from students where admission_no = 'ADM2026-0001'), 'Inter-School Chess Tournament - 2nd Place', 'academic', 'zonal', '2026-06-15', (select id from staff where staff_no = 'T001')
where not exists (select 1 from achievements where student_id = (select id from students where admission_no = 'ADM2026-0001') and title = 'Inter-School Chess Tournament - 2nd Place');

insert into achievements (student_id, title, category, level, achieved_on, recorded_by)
select (select id from students where admission_no = 'ADM2026-0013'), '100m Sprint - 1st Place', 'sports', 'school', '2026-05-20', (select id from staff where staff_no = 'S001')
where not exists (select 1 from achievements where student_id = (select id from students where admission_no = 'ADM2026-0013') and title = '100m Sprint - 1st Place');

insert into memberships (student_id, group_name, position, started_on)
select (select id from students where admission_no = 'ADM2026-0003'), 'Cub Scouts', 'Patrol Leader', '2026-02-01'
where not exists (select 1 from memberships where student_id = (select id from students where admission_no = 'ADM2026-0003') and group_name = 'Cub Scouts');

insert into memberships (student_id, group_name, position, started_on)
select (select id from students where admission_no = 'ADM2026-0007'), 'School Choir', null, '2026-01-15'
where not exists (select 1 from memberships where student_id = (select id from students where admission_no = 'ADM2026-0007') and group_name = 'School Choir');

insert into benefits (student_id, scheme, academic_year_id, status, issued_on, issued_by)
select (select id from students where admission_no = 'ADM2026-0004'), 'School Uniform Grant', (select id from academic_years where is_current), 'issued', '2026-02-10', (select id from staff where staff_no = 'A001')
where not exists (select 1 from benefits where student_id = (select id from students where admission_no = 'ADM2026-0004') and scheme = 'School Uniform Grant');

insert into benefits (student_id, scheme, academic_year_id, status)
select (select id from students where admission_no = 'ADM2026-0010'), 'Textbook Assistance', (select id from academic_years where is_current), 'pending'
where not exists (select 1 from benefits where student_id = (select id from students where admission_no = 'ADM2026-0010') and scheme = 'Textbook Assistance');

-- ---------------------------------------------------------------------
-- Staff responsibilities beyond their class teaching duties.
-- ---------------------------------------------------------------------
insert into responsibilities (staff_id, title, position, academic_year_id, assigned_by)
select (select id from staff where staff_no = 'T003'), 'Sports Coordinator', 'Coordinator', (select id from academic_years where is_current), (select id from staff where staff_no = 'P001')
where not exists (select 1 from responsibilities where staff_id = (select id from staff where staff_no = 'T003') and title = 'Sports Coordinator');

insert into responsibilities (staff_id, title, position, academic_year_id, assigned_by)
select (select id from staff where staff_no = 'A001'), 'Examinations Coordinator', 'Coordinator', (select id from academic_years where is_current), (select id from staff where staff_no = 'P001')
where not exists (select 1 from responsibilities where staff_id = (select id from staff where staff_no = 'A001') and title = 'Examinations Coordinator');

insert into responsibilities (staff_id, title, position, academic_year_id, assigned_by)
select (select id from staff where staff_no = 'ST001'), 'Inventory Custodian', null, (select id from academic_years where is_current), (select id from staff where staff_no = 'A001')
where not exists (select 1 from responsibilities where staff_id = (select id from staff where staff_no = 'ST001') and title = 'Inventory Custodian');

-- ---------------------------------------------------------------------
-- Early leave and a call log.
-- ---------------------------------------------------------------------
insert into early_leaves (student_id, on_date, left_at, reason, collected_by, recorded_by)
select (select id from students where admission_no = 'ADM2026-0002'), '2026-09-07', '11:30', 'Feeling unwell', 'Guardian of Fathima Rifka', (select id from staff where staff_no = 'T001')
where not exists (select 1 from early_leaves where student_id = (select id from students where admission_no = 'ADM2026-0002') and on_date = '2026-09-07');

insert into call_logs (student_id, guardian_id, staff_id, caller_id, purpose)
select s.id, g.id, null, (select id from staff where staff_no = 'T001'), 'Informed guardian about tomorrow''s museum trip form deadline'
from students s
join student_guardians sg on sg.student_id = s.id and sg.is_primary
join guardians g on g.id = sg.guardian_id
where s.admission_no = 'ADM2026-0001'
  and not exists (select 1 from call_logs where student_id = s.id);
