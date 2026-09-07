-- AdminSpec.md section 4.6 leave_types. Entitlements are typical Sri Lankan
-- government school defaults; adjust per school policy in school_settings-
-- style administration once the leave module (build task 13) ships an
-- editor. Safe to re-run.
insert into leave_types (key, name, annual_entitlement, requires_document) values
  ('casual',   'Casual Leave',  7.0,  false),
  ('medical',  'Medical Leave', 7.0,  true),
  ('duty',     'Duty Leave',    5.0,  false),
  ('half_day', 'Half Day',      0.0,  false)
on conflict (key) do update set
  name = excluded.name,
  annual_entitlement = excluded.annual_entitlement,
  requires_document = excluded.requires_document;
