-- Genesis event backfill for party_quests (Phase 8 — true event sourcing).
--
-- Full-snapshot aggregate: one sequence-1 'party_quest.created' event per row whose
-- payload is to_jsonb(row) (capturing current full state incl. updated_at), so replay
-- (latest snapshot per aggregate) reproduces the row exactly with a single event.
-- Idempotent (NOT EXISTS guard), reversible (genesis-tagged).

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select
  'party_quest', q.id, q.session_id, 1, 'party_quest.created',
  to_jsonb(q),
  jsonb_build_object('user_id', null, 'genesis', true),
  q.created_at
from party_quests q
where not exists (
  select 1 from events e where e.aggregate_type = 'party_quest' and e.aggregate_id = q.id
);
