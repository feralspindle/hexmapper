begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000011', 'gm-integrity@example.test'),
  ('00000000-0000-0000-0000-000000000012', 'player-integrity@example.test'),
  ('00000000-0000-0000-0000-000000000014', 'other-gm-integrity@example.test');

insert into public.sessions (id, name, owner_id) values
  ('11000000-0000-0000-0000-000000000001', 'Session A', '00000000-0000-0000-0000-000000000011'),
  ('11000000-0000-0000-0000-000000000002', 'Session B', '00000000-0000-0000-0000-000000000014');

insert into public.session_members (session_id, user_id)
values ('11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012');

insert into public.maps (id, session_id, name) values
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Map A'),
  ('21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', 'Map B');

insert into public.hex_cells (id, session_id, map_id, q, r) values
  ('31000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 0, 0),
  ('31000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', 0, 0);

insert into public.dungeons (id, session_id, hex_id) values
  ('41000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001'),
  ('41000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002');

insert into public.dungeon_rooms
  (id, dungeon_id, session_id, origin_x, origin_y, width, height)
values
  ('51000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 0, 0, 1, 1),
  ('51000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', 0, 0, 1, 1);

insert into public.dungeon_corridors
  (id, dungeon_id, session_id, x1, y1, x2, y2)
values ('61000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', 0, 0, 1, 1);

insert into public.characters (id, session_id, user_id, data) values
  ('81000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '{}'),
  ('81000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000014', '{}'),
  ('81000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000012', '{}');

insert into public.dice_rolls
  (id, session_id, user_id, display_name, pending, modifier, results, total)
values
  ('71000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 'Player', '[]', 0, '[]', 1),
  ('71000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000014', 'Other', '[]', 0, '[]', 1);

insert into public.party_vault_containers (id, session_id, name) values
  ('a1000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Chest A'),
  ('a1000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', 'Chest B');

insert into public.reference_photos
  (id, session_id, user_id, storage_path)
values
  ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '11000000-0000-0000-0000-000000000001/a.jpg'),
  ('91000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000014', '11000000-0000-0000-0000-000000000002/b.jpg');

select throws_ok(
  $sql$insert into public.hex_cells (session_id, map_id, q, r)
       values ('11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000002', 9, 9)$sql$,
  '23503',
  NULL,
  'hex cell rejects a map from another session'
);

select throws_ok(
  $sql$insert into public.dungeons (session_id, hex_id)
       values ('11000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000002')$sql$,
  '23503',
  NULL,
  'dungeon rejects a hex from another session'
);

select throws_ok(
  $sql$insert into public.dungeon_rooms (dungeon_id, session_id, origin_x, origin_y, width, height)
       values ('41000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', 0, 0, 1, 1)$sql$,
  '23503',
  NULL,
  'room rejects a dungeon from another session'
);

select throws_ok(
  $sql$insert into public.dungeon_corridors (dungeon_id, session_id, x1, y1, x2, y2)
       values ('41000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', 0, 0, 1, 1)$sql$,
  '23503',
  NULL,
  'corridor rejects a dungeon from another session'
);

select throws_ok(
  $sql$insert into public.hex_notes (hex_cell_id, session_id, user_id, body)
       values ('31000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'bad link')$sql$,
  '23503',
  NULL,
  'hex note rejects a cell from another session'
);

select throws_ok(
  $sql$insert into public.map_drafts (map_id, session_id, draft_data)
       values ('21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', '{}')$sql$,
  '23503',
  NULL,
  'map draft rejects a map from another session'
);

select throws_ok(
  $sql$insert into public.dice_rolls (session_id, user_id, display_name, pending, modifier, results, total, character_id)
       values ('11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 'Player', '[]', 0, '[]', 1, '81000000-0000-0000-0000-000000000002')$sql$,
  '23503',
  NULL,
  'dice roll rejects a character from another session'
);

select throws_ok(
  $sql$insert into public.dice_roll_annotations (roll_id, session_id, user_id, display_name, body)
       values ('71000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'GM', 'bad link')$sql$,
  '23503',
  NULL,
  'annotation rejects a roll from another session'
);

select throws_ok(
  $sql$insert into public.party_vault_items (session_id, container_id, name)
       values ('11000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'bad link')$sql$,
  '23503',
  NULL,
  'vault item rejects a container from another session'
);

select throws_ok(
  $sql$insert into public.photo_broadcasts (session_id, user_id, photo_id, photo_url)
       values ('11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '91000000-0000-0000-0000-000000000002', 'https://example.test/b.jpg')$sql$,
  '23503',
  NULL,
  'photo broadcast rejects a photo from another session'
);

select throws_ok(
  $sql$update public.sessions
       set active_map_id = '21000000-0000-0000-0000-000000000002'
       where id = '11000000-0000-0000-0000-000000000001'$sql$,
  '23503',
  NULL,
  'session rejects an active map from another session'
);

select throws_ok(
  $sql$update public.session_members
       set active_character_id = '81000000-0000-0000-0000-000000000003'
       where session_id = '11000000-0000-0000-0000-000000000001'
         and user_id = '00000000-0000-0000-0000-000000000012'$sql$,
  '23503',
  NULL,
  'session member rejects an active character from another session'
);

select throws_ok(
  $sql$insert into public.dungeon_element_notes
       (element_id, element_type, session_id, user_id, body)
       values ('51000000-0000-0000-0000-000000000002', 'room', '11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'bad link')$sql$,
  '23503',
  NULL,
  'polymorphic dungeon note rejects an element from another session'
);

select throws_ok(
  $sql$insert into public.dungeon_tokens (session_id, dungeon_id, character_id, x, y)
       values ('11000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000001', 0, 0)$sql$,
  '23503',
  NULL,
  'token rejects a dungeon from another session'
);

select throws_ok(
  $sql$insert into public.dungeon_tokens (session_id, dungeon_id, character_id, x, y)
       values ('11000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000002', 0, 0)$sql$,
  '23503',
  NULL,
  'token rejects a character from another session'
);

select is(
  (
    select count(distinct tablename)
    from pg_policies
    where schemaname = 'public'
      and policyname in ('es_lock_no_insert', 'es_lock_no_update', 'es_lock_no_delete')
      and permissive = 'RESTRICTIVE'
  ),
  30::bigint,
  'all 30 event-sourced projections have restrictive client write locks'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and policyname in ('es_lock_no_insert', 'es_lock_no_update', 'es_lock_no_delete')
      and permissive = 'RESTRICTIVE'
  ),
  90::bigint,
  'every event-sourced projection blocks insert, update, and delete'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$insert into public.sessions (name, owner_id)
       values ('direct client write', '00000000-0000-0000-0000-000000000011')$sql$,
  '42501',
  NULL,
  'GM client cannot insert an event-sourced projection directly'
);

select throws_ok(
  $sql$insert into public.events
       (aggregate_type, aggregate_id, session_id, sequence, event_type, payload)
       values ('session', gen_random_uuid(), '11000000-0000-0000-0000-000000000001', 1, 'session.created', '{}')$sql$,
  '42501',
  NULL,
  'GM client cannot append directly to the event store'
);

update public.maps
set name = 'tampered'
where id = '21000000-0000-0000-0000-000000000001';

select is(
  (select name from public.maps where id = '21000000-0000-0000-0000-000000000001'),
  'Map A'::text,
  'restrictive policy rejects direct GM projection updates'
);

delete from public.maps
where id = '21000000-0000-0000-0000-000000000001';

select is(
  (select count(*) from public.maps where id = '21000000-0000-0000-0000-000000000001'),
  1::bigint,
  'restrictive policy rejects direct GM projection deletes'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000012","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$insert into public.chat_messages (session_id, user_id, display_name, body)
       values ('11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 'Player', 'direct write')$sql$,
  '42501',
  NULL,
  'player client cannot write an event-sourced projection directly'
);

reset role;
select * from finish();
rollback;
