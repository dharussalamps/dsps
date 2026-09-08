-- FR-ANN-05: "the publisher can see who has read an announcement."
-- read_own_announcement_reads (20260907150001_announcements.sql) only ever
-- let a staff member see their own read row — there was no way for an
-- author to see anyone else's, which is the entire point of a read
-- receipt. Widened to also allow the announcement's own author.
drop policy if exists read_own_announcement_reads on announcement_reads;
create policy read_announcement_reads on announcement_reads for select
  using (
    staff_id = current_staff_id()
    or exists (select 1 from announcements a where a.id = announcement_id and a.author_id = current_staff_id())
  );
