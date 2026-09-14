-- staff.staff_no was already unique (people.sql); email and phone were not, so two staff
-- records could silently share a login email or contact number. Backstops the client-side
-- duplicate check in UserAccountsScreen — enforced here too since that check reads from a
-- snapshot of the list, not a live lock, and two admins could otherwise race each other.
create unique index staff_email_unique_idx on staff (lower(email)) where email is not null;
create unique index staff_phone_unique_idx on staff (phone);
