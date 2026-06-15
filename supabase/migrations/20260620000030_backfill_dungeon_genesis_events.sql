-- Genesis event backfill for the dungeon domain (Phase 8). Four aggregates:
-- dungeon (full-snapshot), dungeon_room / dungeon_corridor (collection
-- full-snapshot), dungeon_fog_cell (lifecycle). One sequence-1 creation/reveal
-- event per existing row, copying created_at to preserve the timeline. Also set
-- replica identity FULL on all four — they take UPDATEs/DELETEs and are in the
-- realtime publication (fog DELETE realtime needs cell_x/cell_y in the old row).
-- Idempotent (NOT EXISTS) and reversible (metadata->>'genesis' = 'true').

alter table dungeons          replica identity full;
alter table dungeon_rooms     replica identity full;
alter table dungeon_corridors replica identity full;
alter table dungeon_fog_cells replica identity full;

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'dungeon', d.id, d.session_id, 1, 'dungeon.created', to_jsonb(d),
  jsonb_build_object('user_id', s.owner_id, 'genesis', true), d.created_at
from dungeons d
join sessions s on s.id = d.session_id
where not exists (
  select 1 from events e where e.aggregate_type = 'dungeon' and e.aggregate_id = d.id
);

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'dungeon_room', r.id, r.session_id, 1, 'dungeon_room.created', to_jsonb(r),
  jsonb_build_object('genesis', true), r.created_at
from dungeon_rooms r
where not exists (
  select 1 from events e where e.aggregate_type = 'dungeon_room' and e.aggregate_id = r.id
);

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'dungeon_corridor', c.id, c.session_id, 1, 'dungeon_corridor.created', to_jsonb(c),
  jsonb_build_object('genesis', true), c.created_at
from dungeon_corridors c
where not exists (
  select 1 from events e where e.aggregate_type = 'dungeon_corridor' and e.aggregate_id = c.id
);

-- dungeon_fog_cells has no session_id column; derive it from the dungeon.
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'dungeon_fog_cell', f.id, d.session_id, 1, 'dungeon_fog_cell.revealed', to_jsonb(f),
  jsonb_build_object('genesis', true), f.created_at
from dungeon_fog_cells f
join dungeons d on d.id = f.dungeon_id
where not exists (
  select 1 from events e where e.aggregate_type = 'dungeon_fog_cell' and e.aggregate_id = f.id
);
