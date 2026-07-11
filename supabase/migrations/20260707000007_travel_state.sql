-- issue #51: overland travel procedure. one jsonb blob on sessions holds the
-- config (per-terrain pace in hexes per day, which terrain forces navigation
-- checks) and the running day fraction, so it rides the session realtime
-- UPDATE path. off by default - gm-led groups and house-rule groups just
-- leave it alone.

alter table public.sessions
  add column if not exists travel_state jsonb not null default '{
    "enabled": false,
    "fraction": 0,
    "rates": {"plains": 3, "forest": 2, "mountain": 1, "water": 2, "desert": 2, "swamp": 1, "city": 3, "dungeon": 2, "snow": 1, "volcanic": 1},
    "difficult": ["forest", "mountain", "swamp", "snow", "volcanic"]
  }'::jsonb;
