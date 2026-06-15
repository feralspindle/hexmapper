-- Genesis event backfill for dungeon_activity (Phase 8 — true event sourcing).
--
-- Append-only. Synthesizes a sequence-1 'dungeon_activity.recorded' event per row,
-- preserving the existing display_name in metadata (so replay reproduces it; it is
-- a snapshot, not re-derived). session_id is resolved via the dungeon. created_at
-- copied. Idempotent (NOT EXISTS guard), reversible (genesis-tagged).

-- First, patch any earlier dungeon_activity.recorded events that were written before
-- display_name was carried in the event (its value lived only in the projection).
-- Source the snapshot from the projection row so every event becomes self-contained.
update events e
set metadata = e.metadata || jsonb_build_object('display_name', da.display_name)
from dungeon_activity da
where e.aggregate_type = 'dungeon_activity'
  and e.event_type = 'dungeon_activity.recorded'
  and e.aggregate_id = da.id
  and not (e.metadata ? 'display_name');

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select
  'dungeon_activity',
  da.id,
  d.session_id,
  1,
  'dungeon_activity.recorded',
  jsonb_build_object('dungeon_id', da.dungeon_id, 'verb', da.verb, 'what', da.what),
  jsonb_build_object('user_id', da.user_id, 'display_name', da.display_name, 'genesis', true),
  da.created_at
from dungeon_activity da
join dungeons d on d.id = da.dungeon_id
where not exists (
  select 1 from events e
  where e.aggregate_type = 'dungeon_activity' and e.aggregate_id = da.id
);
