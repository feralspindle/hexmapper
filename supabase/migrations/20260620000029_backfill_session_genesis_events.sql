-- Genesis event backfill for sessions (Phase 8). Full-snapshot aggregate; one
-- 'session.created' per row. Also set replica identity FULL (sessions takes
-- UPDATEs/torch and is in the realtime publication). Idempotent + reversible.

alter table sessions replica identity full;

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'session', s.id, s.id, 1, 'session.created', to_jsonb(s),
  jsonb_build_object('user_id', s.owner_id, 'genesis', true), s.created_at
from sessions s
where not exists (
  select 1 from events e where e.aggregate_type = 'session' and e.aggregate_id = s.id
);
