-- Genesis event backfill for hex_cells (Phase 8). Full-snapshot aggregate; one
-- 'hex_cell.upserted' per row. Idempotent + reversible (genesis-tagged).

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'hex_cell', h.id, h.session_id, 1, 'hex_cell.upserted', to_jsonb(h),
  jsonb_build_object('user_id', null, 'genesis', true), h.created_at
from hex_cells h
where not exists (
  select 1 from events e where e.aggregate_type = 'hex_cell' and e.aggregate_id = h.id
);
