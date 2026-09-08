-- Closes a total, previously undisclosed gap: every scheduled job and RPC
-- that's supposed to "notify" someone (section 7's reminder/escalation/
-- risk/event/low-stock jobs; leave decisions and requests; cover
-- assignments; announcements) only ever wrote a row to `notifications` —
-- nothing ever turned that into an actual push notification on a device,
-- despite section 2's technology table naming "Expo Notifications over FCM
-- and APNs" outright. `devices.push_token` (20260907110003_
-- devices_notifications.sql) was collected by SettingsScreen and never
-- read by anything else in the codebase until this migration.
--
-- pg_net lets Postgres itself make outbound HTTP calls asynchronously
-- (queued, not awaited) — the standard Supabase pattern for calling out
-- from a scheduled job without standing up a separate worker process.
-- Expo's push endpoint needs no auth token for a bare send, so this needs
-- no secret management to work.
create extension if not exists pg_net;

create or replace function job_dispatch_push()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n record;
  d record;
begin
  for n in
    select id, staff_id, title, body, payload
    from notifications
    where sent_at is null
    order by created_at
    limit 200
  loop
    for d in select push_token from devices where staff_id = n.staff_id loop
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object('content-type', 'application/json', 'accept', 'application/json'),
        body := jsonb_build_object(
          'to', d.push_token,
          'title', n.title,
          'body', coalesce(n.body, ''),
          'data', coalesce(n.payload, '{}'::jsonb)
        )
      );
    end loop;
    -- Marked sent even for a staff member with zero registered devices —
    -- that's "nothing to deliver to," not a failure worth retrying forever.
    -- pg_net's own request queue absorbs transient HTTP failures; Expo's
    -- push service is itself the retry layer for delivery to the device.
    update notifications set sent_at = now() where id = n.id;
  end loop;
end;
$$;

select cron.schedule('dispatch_push', '* * * * *', 'select job_dispatch_push()');
