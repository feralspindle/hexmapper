begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- issue #84: rls already denies anon everything, but the table grants from
-- the original schema dump were still in place - one dropped policy away from
-- mattering. pin the revoke at the privilege level so it survives restores.

select is(
  (
    select count(*)::int from pg_tables t
    where t.schemaname = 'public'
      and has_table_privilege('anon', format('public.%I', t.tablename), 'SELECT')
  ),
  0,
  'anon can select from no public table'
);

select is(
  (
    select count(*)::int from pg_tables t
    where t.schemaname = 'public'
      and (
        has_table_privilege('anon', format('public.%I', t.tablename), 'INSERT')
        or has_table_privilege('anon', format('public.%I', t.tablename), 'UPDATE')
        or has_table_privilege('anon', format('public.%I', t.tablename), 'DELETE')
      )
  ),
  0,
  'anon can write to no public table'
);

select * from finish();
rollback;
