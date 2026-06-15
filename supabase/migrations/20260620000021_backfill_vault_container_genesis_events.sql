-- Genesis event backfill for party_vault_containers (Phase 8 — true event sourcing).
-- Full-snapshot create/delete collection aggregate. Idempotent + reversible.

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'party_vault_container', c.id, c.session_id, 1, 'party_vault_container.created',
  to_jsonb(c), jsonb_build_object('user_id', null, 'genesis', true), c.created_at
from party_vault_containers c
where not exists (
  select 1 from events e where e.aggregate_type = 'party_vault_container' and e.aggregate_id = c.id
);
