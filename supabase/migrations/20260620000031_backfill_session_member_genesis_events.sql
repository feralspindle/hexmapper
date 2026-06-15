-- Genesis event backfill for the `session_member` aggregate (Phase 8).
-- session_members is composite-keyed (session_id, user_id) with no surrogate id,
-- so aggregate_id is derived deterministically as md5(session_id||user_id)::uuid.
-- One sequence-1 `session_member.joined` snapshot per row, created_at copied from
-- joined_at. Idempotent (NOT EXISTS), reversible (metadata->>'genesis' = 'true').
-- (session_members is already replica identity full; the alter is a harmless no-op.)

alter table session_members replica identity full;

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'session_member',
       md5(sm.session_id::text || sm.user_id::text)::uuid,
       sm.session_id,
       1,
       'session_member.joined',
       to_jsonb(sm),
       jsonb_build_object('genesis', true),
       sm.joined_at
from session_members sm
where not exists (
  select 1 from events e
  where e.aggregate_type = 'session_member'
    and e.aggregate_id = md5(sm.session_id::text || sm.user_id::text)::uuid
);
