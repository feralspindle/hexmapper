-- issue #84: the original remote_schema dump granted anon nearly everything on
-- public tables and the security overhaul only revoked truncate. rls with no
-- anon policies denies it all today, but that's one dropped policy away from
-- being load-bearing. anon has no business touching any of this app - revoke
-- everything on public tables and sequences, and stop future tables from
-- picking the grants back up via default privileges.

do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end $$;

do $$
declare
  s text;
begin
  for s in select sequencename from pg_sequences where schemaname = 'public' loop
    execute format('revoke all on sequence public.%I from anon', s);
  end loop;
end $$;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
