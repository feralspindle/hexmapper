-- Genesis event backfill for dice_macros (Phase 8 — true event sourcing).
--
-- Synthesizes a sequence-1 'dice_macro.created' event per existing row. Macros are
-- a lifecycle aggregate (created/deleted); deleted macros are already absent from
-- the table, so the current rows are exactly the live aggregates. Payload mirrors
-- what the projector reads back (see domains/macros/projection.rs); created_at is
-- copied. Idempotent (NOT EXISTS guard), reversible (genesis-tagged).

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select
  'dice_macro',
  dm.id,
  null,
  1,
  'dice_macro.created',
  jsonb_build_object(
    'label',    dm.label,
    'pending',  dm.pending,
    'modifier', dm.modifier
  ),
  jsonb_build_object('user_id', dm.user_id, 'genesis', true),
  dm.created_at
from dice_macros dm
where not exists (
  select 1 from events e
  where e.aggregate_type = 'dice_macro' and e.aggregate_id = dm.id
);
