-- Genesis event backfill for maps (Phase 8). Full-snapshot aggregate; one
-- 'map.created' per row (captures current full state incl. later edits).
-- Idempotent + reversible (genesis-tagged).

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'map', m.id, m.session_id, 1, 'map.created', to_jsonb(m),
  jsonb_build_object('user_id', null, 'genesis', true), m.created_at
from maps m
where not exists (
  select 1 from events e where e.aggregate_type = 'map' and e.aggregate_id = m.id
);
