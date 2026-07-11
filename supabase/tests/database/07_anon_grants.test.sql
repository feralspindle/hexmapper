begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- issue #84: rls already denies anon everything, but the table grants from
-- the original schema dump were still in place - one dropped policy away from
-- mattering. pin the revoke at the privilege level so it survives restores.

-- privileges are checked by pg_class oid, not by a rebuilt name: the planner
-- may evaluate quals in any order, and format('public.%I', ...) errors when it
-- runs against a row from another schema (e.g. auth.instances)
select is(
  (
    select count(*)::int
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and has_table_privilege('anon', c.oid, 'SELECT')
  ),
  0,
  'anon can select from no public table'
);

select is(
  (
    select count(*)::int
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (
        has_table_privilege('anon', c.oid, 'INSERT')
        or has_table_privilege('anon', c.oid, 'UPDATE')
        or has_table_privilege('anon', c.oid, 'DELETE')
      )
  ),
  0,
  'anon can write to no public table'
);

select * from finish();
rollback;
