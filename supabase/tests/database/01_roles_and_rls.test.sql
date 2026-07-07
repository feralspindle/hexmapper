begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'gm@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'player@example.test'),
  ('00000000-0000-0000-0000-000000000003', 'outsider@example.test'),
  ('00000000-0000-0000-0000-000000000004', 'other-gm@example.test');

insert into public.sessions (id, name, owner_id) values
  ('10000000-0000-0000-0000-000000000001', 'Test campaign', '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', 'Foreign campaign', '00000000-0000-0000-0000-000000000004');

insert into public.session_members (session_id, user_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');

insert into public.maps (id, session_id, name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Test map'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Foreign map');

update public.sessions
set active_map_id = '20000000-0000-0000-0000-000000000001'
where id = '10000000-0000-0000-0000-000000000001';

insert into public.hex_cells
  (id, session_id, map_id, q, r, revealed, label, gm_markers)
values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 0, 0, true, 'Visible hex', 'GM secret'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 0, 0, true, 'Foreign hex', 'Foreign secret');

insert into public.dungeons (id, session_id, hex_id, name)
values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Test dungeon');

insert into public.dungeon_rooms
  (id, dungeon_id, session_id, origin_x, origin_y, width, height, label)
values ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 0, 0, 2, 2, 'Room');

insert into public.dungeon_corridors
  (id, dungeon_id, session_id, x1, y1, x2, y2)
values ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 0, 0, 2, 2);

insert into public.dungeon_fog_cells (dungeon_id, cell_x, cell_y)
values ('40000000-0000-0000-0000-000000000001', 0, 0);

insert into public.dungeon_activity (dungeon_id, user_id, verb, what)
values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'created', 'room');

insert into public.characters (id, session_id, user_id, data)
values ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '{}');

update public.session_members
set active_character_id = '80000000-0000-0000-0000-000000000001'
where session_id = '10000000-0000-0000-0000-000000000001'
  and user_id = '00000000-0000-0000-0000-000000000002';

insert into public.chat_messages (session_id, user_id, display_name, body)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'GM', 'hello');

insert into public.dice_rolls
  (id, session_id, user_id, display_name, pending, modifier, results, total, character_id)
values ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Player', '[]', 0, '[]', 1, '80000000-0000-0000-0000-000000000001');

insert into public.dice_roll_annotations
  (roll_id, session_id, user_id, display_name, body)
values ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'GM', 'annotated');

insert into public.dice_macros (user_id, label, pending)
values ('00000000-0000-0000-0000-000000000001', 'Attack', '[]');

insert into public.user_preferences (user_id)
values ('00000000-0000-0000-0000-000000000001');

insert into public.hex_notes (hex_cell_id, session_id, user_id, body)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'hex note');

insert into public.dungeon_element_notes
  (element_id, element_type, session_id, user_id, body)
values ('50000000-0000-0000-0000-000000000001', 'room', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'room note');

insert into public.map_drafts (map_id, session_id, draft_data)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '{}');

insert into public.reference_photos
  (id, session_id, user_id, name, storage_path)
values ('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Photo', '10000000-0000-0000-0000-000000000001/photo.jpg');

insert into public.photo_broadcasts
  (session_id, user_id, photo_id, photo_url, photo_name)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'https://example.test/photo.jpg', 'Photo');

insert into public.bug_reports (user_id, description)
values ('00000000-0000-0000-0000-000000000001', 'test bug');

insert into public.character_sheet_log (session_id, user_id, what)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'updated');

insert into public.party_vault_containers (id, session_id, name)
values ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Chest');

insert into public.party_vault_items (session_id, container_id, name)
values ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Rope');

insert into public.party_vault_loot (session_id, name)
values ('10000000-0000-0000-0000-000000000001', 'Gem');

insert into public.party_bank_ledger (session_id, description)
values ('10000000-0000-0000-0000-000000000001', 'Deposit');

insert into public.party_calendar_settings (session_id)
values ('10000000-0000-0000-0000-000000000001');

insert into public.party_calendar_days (session_id, year, month, day)
values ('10000000-0000-0000-0000-000000000001', 1, 1, 1);

insert into public.party_quests (session_id, title)
values ('10000000-0000-0000-0000-000000000001', 'Quest');

insert into public.party_session_notes (session_id, title, content)
values ('10000000-0000-0000-0000-000000000001', 'Session one', 'Notes');

insert into public.light_sources (session_id, created_by, name)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Torch');

insert into public.journal_entries (session_id, author_user_id, author_name, body)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'GM', 'We set out at dawn.');

insert into public.oracle_tables
  (id, session_id, created_by, name)
values ('b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Encounters');

insert into public.oracle_table_rows
  (id, table_id, weight, result)
values ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 1, 'Bandits');

insert into public.oracle_rolls
  (id, session_id, user_id, display_name, kind, table_id, table_name, result)
values ('b2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'GM', 'table', 'b0000000-0000-0000-0000-000000000001', 'Encounters', '{"result":"Bandits"}');

insert into public.events
  (aggregate_type, aggregate_id, session_id, sequence, event_type, payload)
values ('hex_cell', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 'hex_cell.updated', '{"gm_markers":"GM secret"}');

create function pg_temp.assert_no_protected_rows(actor text)
returns setof text
language plpgsql
as $$
declare
  protected_table record;
  visible_count bigint;
begin
  for protected_table in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity
    order by c.relname
  loop
    begin
      execute format('select count(*) from public.%I', protected_table.table_name)
        into visible_count;
      return next extensions.ok(
        visible_count = 0,
        format('%s cannot read protected table public.%I', actor, protected_table.table_name)
      );
    exception when insufficient_privilege then
      return next extensions.pass(
        format('%s has no read grant on protected table public.%I', actor, protected_table.table_name)
      );
    end;
  end loop;
end;
$$;

create function pg_temp.assert_gm_can_read_projections()
returns setof text
language plpgsql
as $$
declare
  protected_table record;
  visible_count bigint;
begin
  for protected_table in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity
      and c.relname <> 'events'
    order by c.relname
  loop
    begin
      execute format('select count(*) from public.%I', protected_table.table_name)
        into visible_count;
      return next extensions.ok(
        visible_count > 0,
        format('GM can read authorized rows from public.%I', protected_table.table_name)
      );
    exception when others then
      return next extensions.ok(
        false,
        format('GM can read authorized rows from public.%I (%s)', protected_table.table_name, sqlerrm)
      );
    end;
  end loop;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select * from pg_temp.assert_gm_can_read_projections();
select is(
  (select gm_markers from public.hex_cells where id = '30000000-0000-0000-0000-000000000001'),
  'GM secret'::text,
  'GM retains direct access to complete hex cell data'
);
select throws_ok(
  'select payload from public.events',
  '42501',
  NULL,
  'raw event payloads remain server-only, including for a GM client'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select is(
  (select count(*) from public.hex_cells),
  0::bigint,
  'player cannot select hex_cells directly'
);
select throws_ok(
  'select payload from public.events where aggregate_type = ''hex_cell''',
  '42501',
  NULL,
  'player cannot read full hex-cell event payloads'
);
select is(
  (select count(*) from public.maps),
  1::bigint,
  'player retains access to an authorized non-sensitive projection'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select * from pg_temp.assert_no_protected_rows('nonmember');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select * from pg_temp.assert_no_protected_rows('anonymous user');

reset role;
select * from finish();
rollback;
