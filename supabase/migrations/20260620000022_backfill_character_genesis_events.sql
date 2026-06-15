-- Genesis event backfill for characters + character_sheet_log (Phase 8).
-- characters: full-snapshot aggregate (one 'character.created' per row).
-- character_sheet_log: append-only ('character_sheet_log.recorded' per row).
-- Idempotent + reversible (genesis-tagged).

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'character', c.id, c.session_id, 1, 'character.created',
  to_jsonb(c), jsonb_build_object('user_id', c.user_id, 'genesis', true), c.created_at
from characters c
where not exists (
  select 1 from events e where e.aggregate_type = 'character' and e.aggregate_id = c.id
);

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'character_sheet_log', l.id, l.session_id, 1, 'character_sheet_log.recorded',
  to_jsonb(l), jsonb_build_object('user_id', l.user_id, 'genesis', true), l.created_at
from character_sheet_log l
where not exists (
  select 1 from events e where e.aggregate_type = 'character_sheet_log' and e.aggregate_id = l.id
);
