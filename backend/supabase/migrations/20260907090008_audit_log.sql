-- AdminSpec.md section 4.10 (audit_log only — pulled forward because every
-- write path from task 2 onward is expected to be auditable from day one).

create table audit_log (
  id           bigserial primary key,
  actor_id     uuid references staff,
  action       text not null,          -- 'insert','update','delete','approve','reopen'
  entity       text not null,
  entity_id    uuid,
  before       jsonb,
  after        jsonb,
  reason       text,
  created_at   timestamptz not null default now()
);
alter table audit_log enable row level security;

create index audit_log_entity on audit_log (entity, entity_id, created_at desc);
