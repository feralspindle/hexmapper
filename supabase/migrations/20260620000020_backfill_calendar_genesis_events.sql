-- Genesis event backfill for the calendar domain (Phase 8 — true event sourcing).
-- party_calendar_settings (one row/session) and party_calendar_days (collection),
-- both full-snapshot upsert aggregates keyed by the row id. Idempotent + reversible.

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'party_calendar_settings', s.id, s.session_id, 1, 'party_calendar_settings.updated',
  to_jsonb(s), jsonb_build_object('user_id', null, 'genesis', true), s.updated_at
from party_calendar_settings s
where not exists (
  select 1 from events e where e.aggregate_type = 'party_calendar_settings' and e.aggregate_id = s.id
);

insert into events (aggregate_type, aggregate_id, session_id, sequence, event_type, payload, metadata, created_at)
select 'party_calendar_day', d.id, d.session_id, 1, 'party_calendar_day.upserted',
  to_jsonb(d), jsonb_build_object('user_id', null, 'genesis', true), d.updated_at
from party_calendar_days d
where not exists (
  select 1 from events e where e.aggregate_type = 'party_calendar_day' and e.aggregate_id = d.id
);
