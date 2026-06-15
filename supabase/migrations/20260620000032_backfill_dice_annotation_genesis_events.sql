-- Genesis event backfill for the `dice_roll_annotation` aggregate (Phase 8).
-- Append-only: one sequence-1 `dice_roll_annotation.created` per row, created_at
-- copied so the timeline is preserved. display_name is carried in metadata (the
-- live trigger re-derives the same value) so replay reproduces it. Idempotent
-- (NOT EXISTS), reversible (metadata->>'genesis' = 'true'). No replica-identity
-- change: the table is INSERT-only in the realtime publication.

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'dice_roll_annotation', a.id, a.session_id, 1, 'dice_roll_annotation.created',
       jsonb_build_object('roll_id', a.roll_id, 'body', a.body),
       jsonb_build_object('user_id', a.user_id, 'display_name', a.display_name, 'genesis', true),
       a.created_at
from dice_roll_annotations a
where not exists (
  select 1 from events e
  where e.aggregate_type = 'dice_roll_annotation' and e.aggregate_id = a.id
);
