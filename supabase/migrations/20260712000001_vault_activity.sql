-- Vault activity log (issue #120): append-only record of who did what to the
-- party vault - added/claimed/split/stored/moved items, container changes.
-- Same shape as dungeon_activity but keyed on session_id, with an optional
-- character_name snapshot so entries can read as the character, not the player.

create table if not exists party_vault_activity (
  id             uuid        primary key default gen_random_uuid(),
  session_id     uuid        not null references sessions(id) on delete cascade,
  user_id        uuid,
  display_name   text        not null default 'Someone',
  character_name text,
  verb           text        not null,
  what           text        not null default '',
  created_at     timestamptz not null default now()
);

create index if not exists party_vault_activity_session_idx on party_vault_activity(session_id, created_at desc);

alter table party_vault_activity enable row level security;

drop policy if exists "party_vault_activity_member_select" on party_vault_activity;
create policy "party_vault_activity_member_select" on party_vault_activity
  as permissive for select to authenticated
  using (is_session_member(session_id));

-- event-sourced table: the Rust API is the only writer (matches 20260620000040)
drop policy if exists es_lock_no_insert on party_vault_activity;
drop policy if exists es_lock_no_update on party_vault_activity;
drop policy if exists es_lock_no_delete on party_vault_activity;
create policy es_lock_no_insert on party_vault_activity as restrictive for insert to authenticated, anon with check (false);
create policy es_lock_no_update on party_vault_activity as restrictive for update to authenticated, anon using (false);
create policy es_lock_no_delete on party_vault_activity as restrictive for delete to authenticated, anon using (false);

alter table party_vault_activity replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'party_vault_activity'
  ) then
    alter publication supabase_realtime add table party_vault_activity;
  end if;
end $$;
