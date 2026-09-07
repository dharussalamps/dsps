-- AdminSpec.md section 10: AttendanceBoard's "remind unmarked" action and
-- Home's per-section remind button — a user-triggered, single-class
-- version of the job_remind_unmarked_classes scheduled job (section 7),
-- gated by attendance.remind rather than running with a job's full
-- authority. SECURITY DEFINER only to reach notifications (which, like
-- audit_log, has no client insert policy); the permission check happens
-- first, as the calling user, before anything is bypassed.
create or replace function remind_unmarked_class(p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_name text;
  v_recipient uuid;
  v_already_submitted boolean;
begin
  if not has_permission(current_staff_id(), 'attendance.remind', p_class_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select exists (
    select 1 from attendance_submissions
    where class_id = p_class_id and on_date = current_date
  ) into v_already_submitted;
  if v_already_submitted then
    raise exception 'already_submitted' using errcode = 'P0002';
  end if;

  select name into v_class_name from classes where id = p_class_id;

  select coalesce(
    (select ca.staff_id from cover_assignments ca
     where ca.class_id = p_class_id and current_date between ca.starts_on and ca.ends_on
     order by ca.created_at desc limit 1),
    (select class_teacher_id from classes where id = p_class_id)
  ) into v_recipient;

  if v_recipient is not null then
    insert into notifications (staff_id, type, title, body, payload)
    values (
      v_recipient,
      'attendance.remind_unmarked',
      'Attendance not marked',
      format('%s has not marked attendance yet today.', v_class_name),
      jsonb_build_object('class_id', p_class_id, 'on_date', current_date, 'manual', true)
    );
  end if;
end;
$$;

grant execute on function remind_unmarked_class(uuid) to authenticated;
