-- issue #52: shared initiative tracker. one jsonb blob on sessions
-- ({entries, active_id, round}) so the order rides the session realtime
-- UPDATE path every client already watches. all mutations go through
-- POST /sessions/:id/initiative, which edits the blob inside a tx - no
-- last-write-wins clobbering between two players adding monsters at once.

alter table public.sessions
  add column if not exists initiative_state jsonb not null
    default '{"entries": [], "active_id": null, "round": 1}'::jsonb;
