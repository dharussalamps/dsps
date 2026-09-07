-- Storage bucket backing GET /export-report (section 8). Private bucket;
-- the Edge Function returns a short-lived signed URL rather than making
-- exports public.
insert into storage.buckets (id, name, public)
values ('exports', 'exports', false)
on conflict (id) do nothing;

create policy write_exports on storage.objects for insert
  with check (bucket_id = 'exports' and has_permission(current_staff_id(), 'report.export'));
create policy read_own_exports on storage.objects for select
  using (bucket_id = 'exports' and owner = auth.uid());
