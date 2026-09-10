-- Lets the app greet a staff member on their birthday (Home screen greeting).
alter table staff add column if not exists birth_date date;
