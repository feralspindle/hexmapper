begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000051', 'owner-import@example.test'),
  ('00000000-0000-0000-0000-000000000052', 'player-import@example.test'),
  ('00000000-0000-0000-0000-000000000053', 'outsider-import@example.test');

insert into public.sessions (id, name, owner_id, play_mode) values
  ('15000000-0000-0000-0000-000000000001', 'Import session', '00000000-0000-0000-0000-000000000051', 'gm_less');

insert into public.session_members (session_id, user_id) values
  ('15000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000052');

insert into public.import_keys (id, session_id, created_by, name, key_hash, key_prefix) values
  ('25000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000051', 'my-familiar', 'deadbeef', 'hxm_dead');

insert into public.compendium_entries (id, session_id, created_by, kind, name, data) values
  ('35000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000051', 'gear', 'Rope', '{"cost":"5 sp"}'),
  ('35000000-0000-0000-0000-000000000002', '15000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000051', 'spell', 'Light', '{"tier":1}');

select throws_ok(
  $sql$insert into public.compendium_entries (session_id, created_by, kind, name)
       values ('15000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000051', 'monster', 'Bad')$sql$,
  '23514',
  NULL,
  'compendium kind is constrained to gear or spell'
);

select throws_ok(
  $sql$insert into public.compendium_entries (session_id, created_by, kind, name)
       values ('15000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000051', 'gear', 'Rope')$sql$,
  '23505',
  NULL,
  'compendium entries are unique per session, kind, and name'
);

-- the session owner
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000051","role":"authenticated"}',
  true
);

select is(
  (select count(*) from import_keys),
  1::bigint,
  'session owner sees their import keys'
);

select is(
  (select count(*) from compendium_entries),
  2::bigint,
  'session owner reads the compendium'
);

select throws_ok(
  $sql$insert into public.import_keys (session_id, created_by, name, key_hash, key_prefix)
       values ('15000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000051', 'rogue', 'cafebabe', 'hxm_cafe')$sql$,
  '42501',
  NULL,
  'owner client cannot insert import keys directly'
);

select throws_ok(
  $sql$insert into public.compendium_entries (session_id, created_by, kind, name)
       values ('15000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000051', 'gear', 'Direct')$sql$,
  '42501',
  NULL,
  'owner client cannot insert compendium entries directly'
);

-- a plain member
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000052","role":"authenticated"}',
  true
);

select is(
  (select count(*) from import_keys),
  0::bigint,
  'members cannot read import keys'
);

select is(
  (select count(*) from compendium_entries),
  2::bigint,
  'members read the compendium'
);

-- an outsider
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000053","role":"authenticated"}',
  true
);

select is(
  (select count(*) from import_keys),
  0::bigint,
  'outsiders cannot read import keys'
);

select is(
  (select count(*) from compendium_entries),
  0::bigint,
  'outsiders cannot read the compendium'
);

select * from finish();
rollback;
