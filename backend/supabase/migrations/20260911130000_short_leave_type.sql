-- Short Leave: unlike casual/medical/duty/half_day, this leave type's real
-- entitlement isn't annual and isn't admin-set — every staff member gets a
-- fixed 2 short leaves per calendar month, enforced client-side
-- (SHORT_LEAVE_MONTHLY_CAP in apps/admin/src/features/leave/api.ts). A 3rd
-- short leave in the same month gets warned about and, on confirmation,
-- submitted as a half-day Casual Leave request instead — so it never even
-- reaches this type's own balance.
--
-- annual_entitlement is therefore unused for this row (set to 0) — do not
-- read it as this type's real cap.
insert into leave_types (key, name, annual_entitlement, requires_document)
values ('short', 'Short Leave', 0, false)
on conflict (key) do nothing;
