-- Genesis event backfill for dungeon_element_notes (Phase 8 — true event sourcing).
-- Same shape as hex_notes: created (seq 1) for every row, plus a synthetic edited
-- (seq 2) for rows whose updated_at differs from created_at so replay reproduces
-- updated_at. display_name preserved in created metadata. Idempotent + reversible.

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select
  'dungeon_element_note', dn.id, dn.session_id, 1, 'dungeon_element_note.created',
  jsonb_build_object('element_id', dn.element_id, 'element_type', dn.element_type, 'body', dn.body),
  jsonb_build_object('user_id', dn.user_id, 'display_name', dn.display_name, 'genesis', true),
  dn.created_at
from dungeon_element_notes dn
where not exists (
  select 1 from events e where e.aggregate_type = 'dungeon_element_note' and e.aggregate_id = dn.id
);

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select
  'dungeon_element_note', dn.id, dn.session_id, 2, 'dungeon_element_note.edited',
  jsonb_build_object('body', dn.body),
  jsonb_build_object('user_id', dn.user_id, 'genesis', true),
  dn.updated_at
from dungeon_element_notes dn
where dn.updated_at is distinct from dn.created_at
  and not exists (
    select 1 from events e
    where e.aggregate_type = 'dungeon_element_note' and e.aggregate_id = dn.id and e.event_type = 'dungeon_element_note.edited'
  );
