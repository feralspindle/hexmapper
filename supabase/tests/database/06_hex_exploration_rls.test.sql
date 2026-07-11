begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- issue #57: unexplored hex contents must not be readable through postgrest in
-- gm_less sessions, including by the session owner (the driver is a player).

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000061', 'driver@example.test'),
  ('00000000-0000-0000-0000-000000000062', 'coop-player@example.test'),
  ('00000000-0000-0000-0000-000000000063', 'gm-led-owner@example.test');

insert into public.sessions (id, name, owner_id, play_mode) values
  ('16000000-0000-0000-0000-000000000001', 'Solo crawl', '00000000-0000-0000-0000-000000000061', 'gm_less'),
  ('16000000-0000-0000-0000-000000000002', 'GM-led game', '00000000-0000-0000-0000-000000000063', 'gm');

insert into public.session_members (session_id, user_id) values
  ('16000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000062');

insert into public.maps (id, session_id, name, exploration_mode) values
  ('26000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000001', 'Overworld', true),
  ('26000000-0000-0000-0000-000000000002', '16000000-0000-0000-0000-000000000002', 'Authored map', false);

insert into public.hex_cells
  (id, session_id, map_id, q, r, revealed, explored, terrain_type, label, notes)
values
  -- explored hex in the gm_less session: visible to the driver
  ('36000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000001', '26000000-0000-0000-0000-000000000001', 0, 0, true, true, 'plains', 'Camp', 'safe'),
  -- unexplored hex with generated-ahead contents: the row this issue is about
  ('36000000-0000-0000-0000-000000000002', '16000000-0000-0000-0000-000000000001', '26000000-0000-0000-0000-000000000001', 1, 0, false, false, 'swamp', 'Witch hut', 'hag lives here'),
  -- unexplored hex in a gm-led session: the owner authored it and keeps access
  ('36000000-0000-0000-0000-000000000003', '16000000-0000-0000-0000-000000000002', '26000000-0000-0000-0000-000000000002', 0, 0, false, false, 'forest', 'Ambush site', 'gm notes');

-- the gm_less owner/driver
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000061","role":"authenticated"}',
  true
);

select is(
  (select count(*) from hex_cells where session_id = '16000000-0000-0000-0000-000000000001'),
  1::bigint,
  'gm_less owner sees only explored hexes'
);

select is(
  (select count(*) from hex_cells where explored = false),
  0::bigint,
  'gm_less owner cannot select any unexplored row'
);

select is(
  (select count(*) from hex_cells
    where terrain_type = 'swamp' or label = 'Witch hut' or notes = 'hag lives here'),
  0::bigint,
  'unexplored contents are unreachable by column for the gm_less owner'
);

-- a non-owner co-op member has no direct select at all (player policy was
-- dropped in 20260620000042, reads go through the api)
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000062","role":"authenticated"}',
  true
);

select is(
  (select count(*) from hex_cells),
  0::bigint,
  'co-op member still has no direct hex_cells select'
);

-- gm-led owner keeps full access to their own unexplored (authored) rows
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000063","role":"authenticated"}',
  true
);

select is(
  (select count(*) from hex_cells where explored = false),
  1::bigint,
  'gm-led owner still reads unexplored rows they authored'
);

select * from finish();
rollback;
