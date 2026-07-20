begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000031', 'owner-oracle@example.test'),
  ('00000000-0000-0000-0000-000000000032', 'partner-oracle@example.test'),
  ('00000000-0000-0000-0000-000000000033', 'outsider-oracle@example.test'),
  ('00000000-0000-0000-0000-000000000034', 'other-owner-oracle@example.test');

insert into public.sessions (id, name, owner_id, play_mode) values
  ('13000000-0000-0000-0000-000000000001', 'Oracle session', '00000000-0000-0000-0000-000000000031', 'gm_less'),
  ('13000000-0000-0000-0000-000000000002', 'Foreign oracle session', '00000000-0000-0000-0000-000000000034', 'gm_less');

insert into public.session_members (session_id, user_id) values
  ('13000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000032');

-- tables are user-owned, so no session column: one per user
insert into public.oracle_tables (id, created_by, name) values
  ('23000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000031', 'Encounter'),
  ('23000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000034', 'Foreign');

insert into public.oracle_table_rows (id, table_id, weight, result) values
  ('33000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', 1, 'Bandits'),
  ('33000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000002', 1, 'Foreign');

insert into public.oracle_rolls
  (id, session_id, user_id, display_name, kind, question, table_id, table_name, result)
values
  ('43000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000031', 'Owner', 'table', null, '23000000-0000-0000-0000-000000000001', 'Encounter', '{"result":"Bandits"}'),
  ('43000000-0000-0000-0000-000000000002', '13000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000034', 'Other', 'table', null, '23000000-0000-0000-0000-000000000002', 'Foreign', '{"result":"Foreign"}');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000031","role":"authenticated"}',
  true
);

select is(
  (select count(*) from oracle_tables),
  1::bigint,
  'a user sees only the oracle tables they own'
);

select is(
  (select count(*) from oracle_table_rows),
  1::bigint,
  'a user sees only rows of tables they own'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000032","role":"authenticated"}',
  true
);

select is(
  (select count(*) from oracle_tables),
  0::bigint,
  'a session partner does not see the owner''s table library'
);

select is(
  (select count(*) from oracle_rolls),
  1::bigint,
  'a session member still sees their session''s roll history'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000033","role":"authenticated"}',
  true
);

select is(
  (select count(*) from oracle_tables),
  0::bigint,
  'outsider cannot read oracle tables'
);

select is(
  (select count(*) from oracle_table_rows),
  0::bigint,
  'outsider cannot read oracle table rows'
);

select is(
  (select count(*) from oracle_rolls),
  0::bigint,
  'outsider cannot read oracle rolls'
);

select * from finish();
rollback;
