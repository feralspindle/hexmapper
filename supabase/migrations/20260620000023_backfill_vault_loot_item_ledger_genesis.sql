-- Genesis event backfill for party_vault_loot, party_vault_items, party_bank_ledger
-- (Phase 8). Full-snapshot aggregates; one created/recorded event per row.
-- Idempotent + reversible (genesis-tagged).

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'party_vault_loot', l.id, l.session_id, 1, 'party_vault_loot.created', to_jsonb(l),
  jsonb_build_object('user_id', null, 'genesis', true), l.created_at
from party_vault_loot l
where not exists (select 1 from events e where e.aggregate_type = 'party_vault_loot' and e.aggregate_id = l.id);

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'party_vault_item', i.id, i.session_id, 1, 'party_vault_item.created', to_jsonb(i),
  jsonb_build_object('user_id', null, 'genesis', true), i.created_at
from party_vault_items i
where not exists (select 1 from events e where e.aggregate_type = 'party_vault_item' and e.aggregate_id = i.id);

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'party_bank_ledger', b.id, b.session_id, 1, 'party_bank_ledger.recorded', to_jsonb(b),
  jsonb_build_object('user_id', null, 'genesis', true), b.created_at
from party_bank_ledger b
where not exists (select 1 from events e where e.aggregate_type = 'party_bank_ledger' and e.aggregate_id = b.id);
