begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000041', 'owner-statblock@example.test'),
  ('00000000-0000-0000-0000-000000000042', 'player-statblock@example.test'),
  ('00000000-0000-0000-0000-000000000043', 'outsider-statblock@example.test'),
  ('00000000-0000-0000-0000-000000000044', 'other-owner-statblock@example.test');

insert into public.sessions (id, name, owner_id, play_mode) values
  ('14000000-0000-0000-0000-000000000001', 'Stat block session', '00000000-0000-0000-0000-000000000041', 'gm_less'),
  ('14000000-0000-0000-0000-000000000002', 'Foreign stat block session', '00000000-0000-0000-0000-000000000044', 'gm_less');

insert into public.session_members (session_id, user_id) values
  ('14000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000042');

insert into public.stat_blocks (id, session_id, created_by, kind, data) values
  ('24000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000041', 'monster', '{"name":"Goblin"}'),
  ('24000000-0000-0000-0000-000000000002', '14000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000041', 'npc', '{"name":"Barkeep"}'),
  ('24000000-0000-0000-0000-000000000003', '14000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000044', 'monster', '{"name":"Foreign ogre"}');

select throws_ok(
  $sql$insert into public.stat_blocks (session_id, created_by, kind)
       values ('14000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000041', 'boss')$sql$,
  '23514',
  NULL,
  'stat block kind is constrained to npc or monster'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000042","role":"authenticated"}',
  true
);

select is(
  (select count(*) from stat_blocks),
  2::bigint,
  'session member sees only their session stat blocks'
);

select throws_ok(
  $sql$insert into public.stat_blocks (session_id, created_by, kind)
       values ('14000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000042', 'monster')$sql$,
  '42501',
  NULL,
  'member client cannot insert stat blocks directly'
);

-- update and delete have no policy at all, so rls hides every row from them
update public.stat_blocks set data = '{"name":"hacked"}'
  where id = '24000000-0000-0000-0000-000000000001';
delete from public.stat_blocks
  where id = '24000000-0000-0000-0000-000000000002';

select is(
  (select count(*) from stat_blocks where data->>'name' = 'hacked'),
  0::bigint,
  'member client update touches no stat block rows'
);

select is(
  (select count(*) from stat_blocks),
  2::bigint,
  'member client delete removes no stat block rows'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000041","role":"authenticated"}',
  true
);

select is(
  (select count(*) from stat_blocks),
  2::bigint,
  'session owner sees only their session stat blocks'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000043","role":"authenticated"}',
  true
);

select is(
  (select count(*) from stat_blocks),
  0::bigint,
  'outsider cannot read stat blocks'
);

select * from finish();
rollback;
