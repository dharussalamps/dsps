-- Address field for staff records — StaffProfileScreen's contact card now
-- lists phone, email and address as separate lines, so staff need somewhere
-- to keep the last of those. Nullable/free text, same shape as
-- guardians.address (20260907090003_people).
alter table staff add column if not exists address text;
