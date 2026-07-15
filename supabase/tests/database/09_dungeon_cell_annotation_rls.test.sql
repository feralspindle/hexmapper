begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- The fog-mode annotation layer (dungeon_icons, dungeon_cell_notes) follows
-- the dungeon_tokens rule from 08: rows on unrevealed ground are GM-only. A
-- GM staging an encounter icon or writing a prep note in fog must not leak
-- either the position or the note body to players until the cell is revealed.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000091', 'cell-gm@example.test'),
  ('00000000-0000-0000-0000-000000000092', 'cell-player@example.test');

insert into public.sessions (id, name, owner_id) values
  ('19000000-0000-0000-0000-000000000001', 'Annotated campaign', '00000000-0000-0000-0000-000000000091');

insert into public.session_members (session_id, user_id) values
  ('19000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000092');

insert into public.maps (id, session_id, name) values
  ('29000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', 'Overworld');

insert into public.hex_cells (id, session_id, map_id, q, r, revealed) values
  ('39000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', 0, 0, true);

insert into public.dungeons (id, session_id, hex_id, name, fog_mode, fog_reveal_all) values
  ('49000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', 'Fogged dungeon', true, false);

-- (0,0) is revealed; (5,5) is not
insert into public.dungeon_fog_cells (dungeon_id, cell_x, cell_y) values
  ('49000000-0000-0000-0000-000000000001', 0, 0);

insert into public.dungeon_icons (id, session_id, dungeon_id, type, label, x, y) values
  ('59000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000001', 'treasure', 'chest', 0, 0),
  ('59000000-0000-0000-0000-000000000002', '19000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000001', 'monster', 'ambush', 5, 5);

insert into public.dungeon_cell_notes (id, session_id, dungeon_id, cell_x, cell_y, user_id, display_name, body) values
  ('69000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000001', 0, 0, '00000000-0000-0000-0000-000000000091', 'GM', 'a mossy door'),
  ('69000000-0000-0000-0000-000000000002', '19000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000001', 5, 5, '00000000-0000-0000-0000-000000000091', 'GM', 'six ghouls wait here');

-- the player
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000092","role":"authenticated"}',
  true
);

select is(
  (select count(*) from dungeon_icons where dungeon_id = '49000000-0000-0000-0000-000000000001'),
  1::bigint,
  'player sees only icons on revealed ground in a fogged dungeon'
);

select is(
  (select count(*) from dungeon_icons
    where id = '59000000-0000-0000-0000-000000000002' or label = 'ambush'),
  0::bigint,
  'the fog-staged icon is unreachable by id or label for the player'
);

select is(
  (select count(*) from dungeon_cell_notes where dungeon_id = '49000000-0000-0000-0000-000000000001'),
  1::bigint,
  'player sees only cell notes on revealed ground'
);

select is(
  (select count(*) from dungeon_cell_notes where body like '%ghouls%'),
  0::bigint,
  'the GM prep note in fog is unreachable for the player'
);

-- the gm
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000091","role":"authenticated"}',
  true
);

select is(
  (select count(*) from dungeon_icons where dungeon_id = '49000000-0000-0000-0000-000000000001'),
  2::bigint,
  'gm reads staged icons through fog'
);

select is(
  (select count(*) from dungeon_cell_notes where dungeon_id = '49000000-0000-0000-0000-000000000001'),
  2::bigint,
  'gm reads prep notes through fog'
);

-- reveal-all switches the fogged dungeon back to full visibility
reset role;
update public.dungeons set fog_reveal_all = true
where id = '49000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000092","role":"authenticated"}',
  true
);

select is(
  (select count(*) from dungeon_icons where dungeon_id = '49000000-0000-0000-0000-000000000001'),
  2::bigint,
  'reveal-all makes staged icons readable again'
);

select is(
  (select count(*) from dungeon_cell_notes where dungeon_id = '49000000-0000-0000-0000-000000000001'),
  2::bigint,
  'reveal-all makes cell notes readable again'
);

select * from finish();
rollback;
