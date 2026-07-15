begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- issue #153: fog-staged tokens must not be readable by players. the GM can
-- park a token in unrevealed fog (ambush staging); the member select policy
-- has to exclude that row until the cell is revealed. GMs see everything,
-- fog-less and reveal-all dungeons are unaffected.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000081', 'fog-gm@example.test'),
  ('00000000-0000-0000-0000-000000000082', 'fog-player@example.test');

insert into public.sessions (id, name, owner_id) values
  ('18000000-0000-0000-0000-000000000001', 'Ambush campaign', '00000000-0000-0000-0000-000000000081');

insert into public.session_members (session_id, user_id) values
  ('18000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000082');

insert into public.maps (id, session_id, name) values
  ('28000000-0000-0000-0000-000000000001', '18000000-0000-0000-0000-000000000001', 'Overworld');

insert into public.hex_cells (id, session_id, map_id, q, r, revealed) values
  ('38000000-0000-0000-0000-000000000001', '18000000-0000-0000-0000-000000000001', '28000000-0000-0000-0000-000000000001', 0, 0, true),
  ('38000000-0000-0000-0000-000000000002', '18000000-0000-0000-0000-000000000001', '28000000-0000-0000-0000-000000000001', 1, 0, true);

insert into public.dungeons (id, session_id, hex_id, name, fog_mode, fog_reveal_all) values
  ('48000000-0000-0000-0000-000000000001', '18000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000001', 'Fogged dungeon', true, false),
  ('48000000-0000-0000-0000-000000000002', '18000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000002', 'Fogless dungeon', false, false);

-- (0,0) is revealed in the fogged dungeon; (5,5) is not
insert into public.dungeon_fog_cells (dungeon_id, cell_x, cell_y) values
  ('48000000-0000-0000-0000-000000000001', 0, 0);

insert into public.characters (id, session_id, user_id, data) values
  ('88000000-0000-0000-0000-000000000001', '18000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000082', '{}'),
  ('88000000-0000-0000-0000-000000000002', '18000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000081', '{}'),
  ('88000000-0000-0000-0000-000000000003', '18000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000081', '{}');

insert into public.dungeon_tokens (id, session_id, dungeon_id, character_id, x, y) values
  -- on revealed ground: players see it
  ('98000000-0000-0000-0000-000000000001', '18000000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000001', '88000000-0000-0000-0000-000000000001', 0, 0),
  -- staged in fog: the ambush this issue is about
  ('98000000-0000-0000-0000-000000000002', '18000000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000001', '88000000-0000-0000-0000-000000000002', 5, 5),
  -- fog-less dungeon: no fog rows exist and none are needed
  ('98000000-0000-0000-0000-000000000003', '18000000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000002', '88000000-0000-0000-0000-000000000003', 9, 9);

-- the player
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000082","role":"authenticated"}',
  true
);

select is(
  (select count(*) from dungeon_tokens where dungeon_id = '48000000-0000-0000-0000-000000000001'),
  1::bigint,
  'player sees only tokens on revealed ground in a fogged dungeon'
);

select is(
  (select count(*) from dungeon_tokens
    where id = '98000000-0000-0000-0000-000000000002' or x = 5 or y = 5),
  0::bigint,
  'the fog-staged token is unreachable by id or position for the player'
);

select is(
  (select count(*) from dungeon_tokens where dungeon_id = '48000000-0000-0000-0000-000000000002'),
  1::bigint,
  'fog-less dungeons still return every token to members'
);

-- the gm
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000081","role":"authenticated"}',
  true
);

select is(
  (select count(*) from dungeon_tokens where dungeon_id = '48000000-0000-0000-0000-000000000001'),
  2::bigint,
  'gm reads staged tokens through fog'
);

-- reveal-all switches the fogged dungeon back to full visibility
reset role;
update public.dungeons set fog_reveal_all = true
where id = '48000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000082","role":"authenticated"}',
  true
);

select is(
  (select count(*) from dungeon_tokens where dungeon_id = '48000000-0000-0000-0000-000000000001'),
  2::bigint,
  'reveal-all makes staged tokens readable again'
);

select * from finish();
rollback;
