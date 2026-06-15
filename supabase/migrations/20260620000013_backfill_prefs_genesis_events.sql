-- Genesis event backfill for user_preferences (Phase 8 — true event sourcing).
--
-- user_preferences is a mutable aggregate keyed by user_id. Pre-existing rows have
-- no recorded history, so we synthesize a single sequence-1 'user_preferences.updated'
-- snapshot event capturing current state; true delta events accumulate from here.
-- created_at is copied from updated_at so replay reproduces updated_at exactly.
-- Idempotent (NOT EXISTS guard), reversible (genesis-tagged).

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select
  'user_preferences',
  up.user_id,
  null,
  1,
  'user_preferences.updated',
  jsonb_build_object(
    'dungeon_map_style',    up.dungeon_map_style,
    'dungeon_density',      up.dungeon_density,
    'dungeon_palette',      up.dungeon_palette,
    'dungeon_icon_style',   up.dungeon_icon_style,
    'dungeon_panel_layout', up.dungeon_panel_layout,
    'dungeon_show_cursors', up.dungeon_show_cursors
  ),
  jsonb_build_object('user_id', up.user_id, 'genesis', true),
  up.updated_at
from user_preferences up
where not exists (
  select 1 from events e
  where e.aggregate_type = 'user_preferences' and e.aggregate_id = up.user_id
);
