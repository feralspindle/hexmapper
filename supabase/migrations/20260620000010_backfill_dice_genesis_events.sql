-- Genesis event backfill for dice_rolls (Phase 8 — true event sourcing).
--
-- Every dice_rolls row that predates the events table has no event behind it.
-- This synthesizes a sequence-1 'dice_roll.rolled' genesis event per such row so
-- the event log becomes a complete, replayable source of truth. The payload mirrors
-- exactly what the projector reads back (see domains/dice/projection.rs), and
-- created_at is copied from the row so the timeline is preserved.
--
-- Additive and idempotent: the NOT EXISTS guard skips rows that already have an
-- event (those created via the Rust server). Reversible: genesis events are tagged
-- metadata->>'genesis' = 'true' and can be deleted to undo this migration.

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select
  'dice_roll',
  dr.id,
  dr.session_id,
  1,
  'dice_roll.rolled',
  jsonb_build_object(
    'pending',      dr.pending,
    'modifier',     dr.modifier,
    'results',      dr.results,
    'total',        dr.total,
    'label',        dr.label,
    'character_id', dr.character_id
  ),
  jsonb_build_object('user_id', dr.user_id, 'genesis', true),
  dr.created_at
from dice_rolls dr
where not exists (
  select 1 from events e
  where e.aggregate_type = 'dice_roll' and e.aggregate_id = dr.id
);
