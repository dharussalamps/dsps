-- AdminSpec.md section 5.2 — role seed. Safe to re-run.
insert into roles (key, name, is_system) values
  ('principal',       'Principal',       true),
  ('vice_principal',  'Vice Principal',  true),
  ('sectional_head',  'Sectional Head',  true),
  ('class_teacher',   'Class Teacher',   true),
  ('administrator',   'Administrator',   true),
  ('staff',           'Staff',           true)
on conflict (key) do update set name = excluded.name;
