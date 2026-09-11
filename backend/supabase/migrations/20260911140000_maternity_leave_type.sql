-- Maternity Leave: an annual, admin-allocatable leave type like casual and
-- medical (not fixed/monthly like short leave). Default entitlement of 84
-- days follows Sri Lanka's Maternity Benefits Ordinance (12 weeks for a
-- first/second child) — the principal can override it per staff member in
-- Leave Allocation the same way as casual/medical if the real figure for a
-- given staff member differs (e.g. a third child, at 42 days).
insert into leave_types (key, name, annual_entitlement, requires_document)
values ('maternity', 'Maternity Leave', 84, true)
on conflict (key) do nothing;
