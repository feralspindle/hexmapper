begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- storage.protect_delete() blocks all direct SQL deletes on storage.objects
-- unless this GUC is set, forcing real deletes through the Storage API in prod.
-- Opting in here lets the RLS DELETE policies decide the outcome instead of the
-- blanket trigger, which is what these tests are actually exercising.
select set_config('storage.allow_delete_query', 'true', true);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000021', 'gm-storage@example.test'),
  ('00000000-0000-0000-0000-000000000022', 'player-storage@example.test'),
  ('00000000-0000-0000-0000-000000000023', 'outsider-storage@example.test'),
  ('00000000-0000-0000-0000-000000000024', 'other-gm-storage@example.test');

insert into public.sessions (id, name, owner_id) values
  ('12000000-0000-0000-0000-000000000001', 'Storage session', '00000000-0000-0000-0000-000000000021'),
  ('12000000-0000-0000-0000-000000000002', 'Foreign storage session', '00000000-0000-0000-0000-000000000024');

insert into public.session_members (session_id, user_id)
values ('12000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000022');

insert into storage.buckets (id, name, public) values
  ('bug-screenshots', 'bug-screenshots', false),
  ('dungeon-images', 'dungeon-images', false),
  ('reference-photos', 'reference-photos', true),
  ('session-maps', 'session-maps', false)
on conflict (id) do update set public = excluded.public;

insert into storage.objects (id, bucket_id, name, owner) values
  ('b0000000-0000-0000-0000-000000000001', 'bug-screenshots', '00000000-0000-0000-0000-000000000021/bug.png', '00000000-0000-0000-0000-000000000021'),
  ('b0000000-0000-0000-0000-000000000002', 'dungeon-images', '12000000-0000-0000-0000-000000000001/dungeon/image.png', '00000000-0000-0000-0000-000000000021'),
  ('b0000000-0000-0000-0000-000000000003', 'reference-photos', '12000000-0000-0000-0000-000000000001/photo.png', '00000000-0000-0000-0000-000000000022'),
  ('b0000000-0000-0000-0000-000000000004', 'session-maps', '12000000-0000-0000-0000-000000000001/map.png', '00000000-0000-0000-0000-000000000021'),
  ('b0000000-0000-0000-0000-000000000005', 'session-maps', '12000000-0000-0000-0000-000000000002/foreign-map.png', '00000000-0000-0000-0000-000000000024');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select count(*) from storage.objects where bucket_id = 'reference-photos'),
  1::bigint,
  'anonymous users can read the intentionally public reference-photo bucket'
);
select is(
  (select count(*) from storage.objects where bucket_id <> 'reference-photos'),
  0::bigint,
  'anonymous users cannot read private photo and map buckets'
);
select throws_ok(
  $sql$insert into storage.objects (bucket_id, name)
       values ('reference-photos', '12000000-0000-0000-0000-000000000001/anonymous.png')$sql$,
  '42501',
  NULL,
  'anonymous users cannot mutate storage'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000023","role":"authenticated"}',
  true
);

select is(
  (select count(*) from storage.objects where bucket_id = 'session-maps'),
  0::bigint,
  'nonmember cannot read any session map'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'bug-screenshots'),
  0::bigint,
  'non-owner cannot read another user screenshot'
);
select throws_ok(
  $sql$insert into storage.objects (bucket_id, name, owner)
       values ('reference-photos', '12000000-0000-0000-0000-000000000001/outsider.png', '00000000-0000-0000-0000-000000000023')$sql$,
  '42501',
  NULL,
  'nonmember cannot upload a photo into a session'
);

delete from storage.objects
where id = 'b0000000-0000-0000-0000-000000000003';

select is(
  (select count(*) from storage.objects where id = 'b0000000-0000-0000-0000-000000000003'),
  1::bigint,
  'non-owner cannot delete another user reference photo'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}',
  true
);

select is(
  (select count(*) from storage.objects where bucket_id = 'session-maps'),
  1::bigint,
  'player can read the map for their session but not a foreign map'
);
select lives_ok(
  $sql$insert into storage.objects (bucket_id, name, owner)
       values ('reference-photos', '12000000-0000-0000-0000-000000000001/player-upload.png', '00000000-0000-0000-0000-000000000022')$sql$,
  'session member can upload a reference photo'
);
select throws_ok(
  $sql$insert into storage.objects (bucket_id, name, owner)
       values ('dungeon-images', '12000000-0000-0000-0000-000000000001/dungeon/player.png', '00000000-0000-0000-0000-000000000022')$sql$,
  '42501',
  NULL,
  'player cannot upload a GM-only dungeon image'
);
select throws_ok(
  $sql$insert into storage.objects (bucket_id, name, owner)
       values ('session-maps', '12000000-0000-0000-0000-000000000001/player-map.png', '00000000-0000-0000-0000-000000000022')$sql$,
  '42501',
  NULL,
  'player cannot upload a session map'
);
select throws_ok(
  $sql$insert into storage.objects (bucket_id, name, owner)
       values ('bug-screenshots', '00000000-0000-0000-0000-000000000021/spoofed.png', '00000000-0000-0000-0000-000000000022')$sql$,
  '42501',
  NULL,
  'user cannot upload a screenshot into another user folder'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}',
  true
);

select lives_ok(
  $sql$insert into storage.objects (bucket_id, name, owner)
       values ('dungeon-images', '12000000-0000-0000-0000-000000000001/dungeon/gm.png', '00000000-0000-0000-0000-000000000021')$sql$,
  'GM can upload a dungeon image for their session'
);
select lives_ok(
  $sql$insert into storage.objects (bucket_id, name, owner)
       values ('session-maps', '12000000-0000-0000-0000-000000000001/gm-map.png', '00000000-0000-0000-0000-000000000021')$sql$,
  'GM can upload a session map for their session'
);

delete from storage.objects
where id = 'b0000000-0000-0000-0000-000000000002';

select is(
  (select count(*) from storage.objects where id = 'b0000000-0000-0000-0000-000000000002'),
  0::bigint,
  'GM can delete a dungeon image for their session'
);

reset role;
select * from finish();
rollback;
