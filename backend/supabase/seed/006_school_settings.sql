-- Single-row settings table (id is a boolean-typed singleton key). Safe to re-run.
insert into school_settings (id, school_name, timezone)
values (true, 'WP/GM/Dharussalam Primary School, Thihariya', 'Asia/Colombo')
on conflict (id) do update set school_name = excluded.school_name;
