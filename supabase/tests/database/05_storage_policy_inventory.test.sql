-- Regression canary for the 2026-06 restore incident: a DB restore silently
-- dropped every RLS policy on storage.objects, turning the table deny-all and
-- breaking all signed image URLs with "Object not found". The behavioral tests
-- in 03 prove the policies *work*; this file proves the expected policies
-- *exist*, so a restore or migration drift that wipes them fails loudly even
-- when no behavioral scenario happens to touch the missing command.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok(
  (select relrowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'storage' and c.relname = 'objects'),
  'RLS is enabled on storage.objects'
);

create or replace function pg_temp.bucket_has_policy(bucket text, wanted_cmd text)
returns boolean language sql as $$
  select exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd = wanted_cmd
      and (coalesce(qual, '') like '%' || bucket || '%'
        or coalesce(with_check, '') like '%' || bucket || '%')
  );
$$;

select ok(pg_temp.bucket_has_policy('session-maps', 'SELECT'),
  'session-maps has a SELECT policy (signed map/dungeon image URLs depend on it)');
select ok(pg_temp.bucket_has_policy('session-maps', 'INSERT'),
  'session-maps has an INSERT policy');
select ok(pg_temp.bucket_has_policy('session-maps', 'DELETE'),
  'session-maps has a DELETE policy');

select ok(pg_temp.bucket_has_policy('dungeon-images', 'INSERT'),
  'dungeon-images has an INSERT policy');
select ok(pg_temp.bucket_has_policy('dungeon-images', 'DELETE'),
  'dungeon-images has a DELETE policy');

select ok(pg_temp.bucket_has_policy('reference-photos', 'SELECT'),
  'reference-photos has a SELECT policy (member-only reads)');
select ok(pg_temp.bucket_has_policy('reference-photos', 'INSERT'),
  'reference-photos has an INSERT policy');
select ok(pg_temp.bucket_has_policy('reference-photos', 'DELETE'),
  'reference-photos has a DELETE policy');

select ok(pg_temp.bucket_has_policy('bug-screenshots', 'INSERT'),
  'bug-screenshots has an INSERT policy');

select ok(
  (select count(*) from pg_policies
   where schemaname = 'storage' and tablename = 'objects') >= 9,
  'storage.objects keeps at least its nine known policies (deny-all restore canary)'
);

select * from finish();
rollback;
