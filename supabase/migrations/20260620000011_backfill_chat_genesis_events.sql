-- Genesis event backfill for chat_messages (Phase 8 — true event sourcing).
--
-- Synthesizes a sequence-1 'chat_message.sent' event per pre-existing row so the
-- event log becomes a complete, replayable source of truth. Payload mirrors what
-- the projector reads back (see domains/chat/projection.rs); created_at is copied
-- from the row. Additive, idempotent (NOT EXISTS guard), reversible (genesis events
-- tagged metadata->>'genesis' = 'true').

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select
  'chat_message',
  cm.id,
  cm.session_id,
  1,
  'chat_message.sent',
  jsonb_build_object('body', cm.body),
  jsonb_build_object('user_id', cm.user_id, 'genesis', true),
  cm.created_at
from chat_messages cm
where not exists (
  select 1 from events e
  where e.aggregate_type = 'chat_message' and e.aggregate_id = cm.id
);
