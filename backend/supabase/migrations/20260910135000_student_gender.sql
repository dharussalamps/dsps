-- Gender field for student records — AddStudentScreen requires picking
-- male or female when creating a student.
alter table students add column if not exists gender text check (gender in ('male', 'female'));
