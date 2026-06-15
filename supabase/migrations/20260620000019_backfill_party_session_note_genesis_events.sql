-- Genesis event backfill for party_session_notes (Phase 8 — true event sourcing).
-- Full-snapshot aggregate: one sequence-1 'party_session_note.created' per row with
-- payload to_jsonb(row). Idempotent + reversible (genesis-tagged).

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select
  'party_session_note', n.id, n.session_id, 1, 'party_session_note.created',
  to_jsonb(n),
  jsonb_build_object('user_id', null, 'genesis', true),
  n.created_at
from party_session_notes n
where not exists (
  select 1 from events e where e.aggregate_type = 'party_session_note' and e.aggregate_id = n.id
);
