-- rewrite-photo-broadcast-urls.sql
--
-- Historically the app persisted an ABSOLUTE reference-photo URL into
-- photo_broadcasts.photo_url (and the photo_broadcast.sent event payload),
-- baking a Supabase project ref into the data. This converts those to the
-- RELATIVE storage_path (ref-agnostic), so the client resolves the URL per
-- environment via getPublicUrl (see photoStore.js _resolveBroadcast).
--
-- Must update BOTH tables: events is the append-only source of truth, and
-- replay_photo_broadcasts() rebuilds photo_broadcasts from it — rewriting only
-- the projection would regress on the next replay.
--
-- Deploy the photoStore.js change BEFORE running this: an old client renders
-- photo_url verbatim, so a relative value would break there.
--
-- Usage:
--   DRY RUN : psql "$URL" -f deploy/rewrite-photo-broadcast-urls.sql
--             (the UPDATEs are inside a rolled-back transaction by default)
--   APPLY   : psql "$URL" -v apply=1 -f deploy/rewrite-photo-broadcast-urls.sql

\set ON_ERROR_STOP on
\set prefix_re '^https?://[a-z0-9]+\\.supabase\\.co/storage/v1/object/public/reference-photos/'

-- ---- preview: how many rows will change, and a sample before/after ----
select 'photo_broadcasts' as tbl,
       count(*) as to_rewrite
from photo_broadcasts
where photo_url ~ :'prefix_re';

select 'events (photo_broadcast.sent)' as tbl,
       count(*) as to_rewrite
from events
where event_type = 'photo_broadcast.sent'
  and payload->>'photo_url' ~ :'prefix_re';

select photo_url as before,
       regexp_replace(photo_url, :'prefix_re', '') as after
from photo_broadcasts
where photo_url ~ :'prefix_re'
limit 3;

-- ---- the mutation, atomic; rolled back unless -v apply=1 ----
begin;

update photo_broadcasts
set photo_url = regexp_replace(photo_url, :'prefix_re', '')
where photo_url ~ :'prefix_re';

update events
set payload = jsonb_set(payload, '{photo_url}',
      to_jsonb(regexp_replace(payload->>'photo_url', :'prefix_re', '')))
where event_type = 'photo_broadcast.sent'
  and payload->>'photo_url' ~ :'prefix_re';

-- guard: nothing absolute should remain
select 'remaining_absolute' as check,
       (select count(*) from photo_broadcasts where photo_url ~ :'prefix_re')
     + (select count(*) from events
        where event_type='photo_broadcast.sent' and payload->>'photo_url' ~ :'prefix_re')
       as should_be_zero;

\if :{?apply}
  commit;
  \echo '>> COMMITTED photo-URL rewrite'
\else
  rollback;
  \echo '>> DRY RUN (rolled back). Re-run with -v apply=1 to commit.'
\endif
