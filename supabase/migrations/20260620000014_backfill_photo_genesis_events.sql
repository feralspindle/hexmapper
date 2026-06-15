-- Genesis event backfill for the photo domain (Phase 8 — true event sourcing).
-- Covers both aggregates: reference_photo (lifecycle) and photo_broadcast (append-only).
-- session_id (text uuid in these tables) is cast to uuid for the events column.
-- Idempotent (NOT EXISTS guards), reversible (genesis-tagged).

-- reference_photos -> reference_photo.created
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select
  'reference_photo',
  rp.id,
  rp.session_id::uuid,
  1,
  'reference_photo.created',
  jsonb_build_object('name', rp.name, 'storage_path', rp.storage_path),
  jsonb_build_object('user_id', rp.user_id, 'genesis', true),
  coalesce(rp.created_at, now())
from reference_photos rp
where not exists (
  select 1 from events e
  where e.aggregate_type = 'reference_photo' and e.aggregate_id = rp.id
);

-- photo_broadcasts -> photo_broadcast.sent
-- photo_id may already be NULL (referenced photo deleted before the events table);
-- the stored payload captures current state, which replay reproduces faithfully.
insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select
  'photo_broadcast',
  pb.id,
  pb.session_id::uuid,
  1,
  'photo_broadcast.sent',
  jsonb_build_object('photo_id', pb.photo_id, 'photo_url', pb.photo_url, 'photo_name', pb.photo_name),
  jsonb_build_object('user_id', pb.user_id, 'genesis', true),
  coalesce(pb.created_at, now())
from photo_broadcasts pb
where not exists (
  select 1 from events e
  where e.aggregate_type = 'photo_broadcast' and e.aggregate_id = pb.id
);
