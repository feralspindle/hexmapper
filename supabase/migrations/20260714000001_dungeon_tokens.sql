-- Player tokens on the dungeon grid. One token per character per dungeon,
-- position in cell coords (same grid as dungeon_fog_cells). Writes go through
-- the rust server only (event-sourced, aggregate dungeon_token); clients get
-- member-scoped selects for the initial load and realtime for updates.

create table if not exists dungeon_tokens (
  id            uuid        primary key default gen_random_uuid(),
  dungeon_id    uuid        not null references dungeons(id) on delete cascade,
  session_id    uuid        not null references sessions(id) on delete cascade,
  character_id  uuid        not null references characters(id) on delete cascade,
  x             integer     not null,
  y             integer     not null,
  source_client text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (dungeon_id, character_id)
);

create index if not exists dungeon_tokens_dungeon_idx
  on dungeon_tokens(dungeon_id);

alter table dungeon_tokens enable row level security;

-- member select only, writes go through the api
drop policy if exists "dungeon_tokens_member_select" on dungeon_tokens;
create policy "dungeon_tokens_member_select" on dungeon_tokens
  as permissive for select to authenticated
  using (is_session_member(session_id));

alter table dungeon_tokens replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dungeon_tokens'
  ) then
    alter publication supabase_realtime add table dungeon_tokens;
  end if;
end $$;
