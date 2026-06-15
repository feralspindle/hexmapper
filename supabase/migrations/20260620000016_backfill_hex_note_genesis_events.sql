-- Genesis event backfill for hex_notes (Phase 8 — true event sourcing).
--
-- hex_note is a lifecycle + mutable aggregate (created / edited / deleted). We have
-- no edit history, so we synthesize: a sequence-1 'created' for every row, and — for
-- rows whose updated_at differs from created_at (edited before the events table) — a
-- sequence-2 'edited' carrying current body so replay reproduces updated_at exactly.
-- display_name is preserved in created metadata. Idempotent + reversible (genesis-tagged).

-- created (sequence 1)
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select
  'hex_note', hn.id, hn.session_id, 1, 'hex_note.created',
  jsonb_build_object('hex_cell_id', hn.hex_cell_id, 'body', hn.body),
  jsonb_build_object('user_id', hn.user_id, 'display_name', hn.display_name, 'genesis', true),
  hn.created_at
from hex_notes hn
where not exists (
  select 1 from events e where e.aggregate_type = 'hex_note' and e.aggregate_id = hn.id
);

-- edited (sequence 2) for rows that were edited before the events table existed
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select
  'hex_note', hn.id, hn.session_id, 2, 'hex_note.edited',
  jsonb_build_object('body', hn.body),
  jsonb_build_object('user_id', hn.user_id, 'genesis', true),
  hn.updated_at
from hex_notes hn
where hn.updated_at is distinct from hn.created_at
  and not exists (
    select 1 from events e
    where e.aggregate_type = 'hex_note' and e.aggregate_id = hn.id and e.event_type = 'hex_note.edited'
  );
